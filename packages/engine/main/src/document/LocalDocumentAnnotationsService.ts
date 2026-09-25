import {
  AbortablePromise,
  EngineError,
  EngineErrorCode,
  annotationImportFacts,
  generateUuid,
  wirePack,
  type AnnotationBundle,
  type AnnotationExportSelection,
  type AnnotationImportOptions,
  type AnnotationImportResult,
  type AnnotationListPageSnapshot,
  type AnnotationListSnapshotAllPages,
  type DocumentAnnotationsService,
  type WeakAnnotationEditSession,
  type PageRef,
} from '@embedpdf/engine-core/runtime';
import type { SessionEventPublisher } from '@embedpdf/engine-services';

import type { ScopeGuard } from '../scope';
import { Priority } from '../worker/Priority';
import type { JobId, WorkerResultPayload } from '../worker/protocol';
import type { WorkerQueue } from '../worker/WorkerQueue';

interface DocClosedView {
  isClosed(): boolean;
}

/**
 * Document-scoped annotation reads, dispatched through the same
 * WorkerQueue every other local read uses. The worker host fans out to
 * `RawAnnotationReader.listAll` / `RawAnnotationReader.listOne`.
 */
export class LocalDocumentAnnotationsService implements DocumentAnnotationsService {
  constructor(
    private readonly docId: string,
    private readonly queue: WorkerQueue,
    private readonly view: DocClosedView,
    private readonly guard: ScopeGuard,
    private readonly publisher: SessionEventPublisher,
  ) {}

  export(selection: AnnotationExportSelection = {}): AbortablePromise<AnnotationBundle> {
    if (this.view.isClosed()) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, `document not open: ${this.docId}`),
      );
    }
    // The annotations and the bytes beside them: `readResource`'s gate too.
    try {
      this.guard.assertCapability('doc.annotate.read');
      this.guard.assertCapability('doc.download');
    } catch (err) {
      return AbortablePromise.rejectReason(err);
    }
    const docId = this.docId;
    const submission = this.queue.enqueue<WorkerResultPayload>(
      {
        buildPack: (jobId: JobId) =>
          wirePack({ kind: 'annotations.export', jobId, docId, selection: { ...selection } }),
      },
      { priority: Priority.MEDIUM },
    );
    return AbortablePromise.run<AnnotationBundle>(async (signal) => {
      const onAbort = () => submission.abort(signal.reason);
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
      const payload = await submission;
      if (payload.tag !== 'annotations.export') {
        throw new EngineError(EngineErrorCode.WireFormat, `unexpected payload tag: ${payload.tag}`);
      }
      // The worker transferred each resource's buffer: the bundle owns it now.
      const { bundle } = payload;
      const resources: AnnotationBundle['resources'] = Object.fromEntries(
        Object.entries(bundle.resources).map(([id, bytes]) => [id, new Uint8Array(bytes)]),
      );
      return { ...bundle, resources };
    });
  }

  import(
    bundle: AnnotationBundle,
    options: AnnotationImportOptions = {},
  ): AbortablePromise<AnnotationImportResult> {
    if (this.view.isClosed()) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, `document not open: ${this.docId}`),
      );
    }
    const attribution = options.attribution ?? 'restore';
    try {
      this.guard.assertCapability('doc.annotate.modify');
      if (attribution === 'restore') {
        this.guard.assertCapability('doc.annotate.import');
      } else {
        this.assertMayCreate(bundle);
      }
    } catch (err) {
      return AbortablePromise.rejectReason(err);
    }
    // The session: whom `stamp` attributes to, whom `restore` records as `importedBy`.
    const actor = this.guard.actorForCreate();
    const opId = options.opId ?? generateUuid();
    const docId = this.docId;
    return AbortablePromise.run<AnnotationImportResult>(async (signal) => {
      // A private copy of each resource rides the transfer list, once
      // however many items name it; the caller's bytes stay intact.
      const resources = Object.fromEntries(
        Object.entries(bundle.resources).map(([id, bytes]) => [
          id,
          new Uint8Array(bytes).buffer as ArrayBuffer,
        ]),
      );
      const submission = this.queue.enqueue<WorkerResultPayload>(
        {
          buildPack: (jobId: JobId) =>
            wirePack(
              {
                kind: 'annotations.import',
                jobId,
                docId,
                bundle: { ...bundle, resources },
                ...(options.pages !== undefined ? { pages: options.pages } : {}),
                attribution,
                ...(actor ? { actor } : {}),
              },
              Object.values(resources),
            ),
        },
        { priority: Priority.HIGH },
      );
      const onAbort = () => submission.abort(signal.reason);
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
      const payload = await submission;
      if (payload.tag !== 'annotations.import') {
        throw new EngineError(EngineErrorCode.WireFormat, `unexpected payload tag: ${payload.tag}`);
      }
      const facts = annotationImportFacts(payload.result);
      facts.forEach((fact, index) => {
        this.publisher.publishLocal(
          { type: 'annotation.created', ...fact },
          { id: opId, index, count: facts.length },
        );
      });
      return payload.result;
    });
  }

  /**
   * An import that stamps the session makes each annotation as `create`
   * would, so it takes the same authority for every group its items name.
   */
  private assertMayCreate(bundle: AnnotationBundle): void {
    const ownGroup = this.guard.identity().groupId;
    const groups = new Set<string | undefined>();
    for (const { data } of bundle.items) {
      const { groupId } = data as { groupId?: string | null };
      groups.add(typeof groupId === 'string' ? groupId : undefined);
    }
    for (const groupId of groups) {
      if (groupId !== undefined && groupId !== ownGroup) this.guard.assertSetGroup(groupId);
      this.guard.assertCollab('create', this.guard.targetForSelfCreate(groupId));
    }
  }

  listRawAll(): AbortablePromise<AnnotationListSnapshotAllPages> {
    if (this.view.isClosed()) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, `document not open: ${this.docId}`),
      );
    }
    // Annotation reads gate on `doc.annotate.read` (cloud parity:
    // GET /annotations → requireResource('annotations-read')).
    try {
      this.guard.assertCapability('doc.annotate.read');
    } catch (err) {
      return AbortablePromise.rejectReason(err);
    }
    const docId = this.docId;
    const submission = this.queue.enqueue<WorkerResultPayload>(
      {
        buildPack: (jobId: JobId) => wirePack({ kind: 'annotations.listRawAll', jobId, docId }),
      },
      { priority: Priority.MEDIUM },
    );
    return AbortablePromise.run<AnnotationListSnapshotAllPages>(async (signal) => {
      const onAbort = () => submission.abort(signal.reason);
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
      const payload = await submission;
      if (payload.tag !== 'annotations.listRawAll') {
        throw new EngineError(EngineErrorCode.WireFormat, `unexpected payload tag: ${payload.tag}`);
      }
      return payload.snapshot;
    });
  }

  listRaw(page: PageRef): AbortablePromise<AnnotationListPageSnapshot> {
    if (this.view.isClosed()) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, `document not open: ${this.docId}`),
      );
    }
    try {
      this.guard.assertCapability('doc.annotate.read');
    } catch (err) {
      return AbortablePromise.rejectReason(err);
    }
    const docId = this.docId;
    const submission = this.queue.enqueue<WorkerResultPayload>(
      {
        buildPack: (jobId: JobId) =>
          wirePack({
            kind: 'annotations.listRawPage',
            jobId,
            docId,
            page,
          }),
      },
      { priority: Priority.MEDIUM },
    );
    return AbortablePromise.run<AnnotationListPageSnapshot>(async (signal) => {
      const onAbort = () => submission.abort(signal.reason);
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
      const payload = await submission;
      if (payload.tag !== 'annotations.listRawPage') {
        throw new EngineError(EngineErrorCode.WireFormat, `unexpected payload tag: ${payload.tag}`);
      }
      return payload.snapshot;
    });
  }

  beginWeakEdit(pages: readonly PageRef[]): AbortablePromise<WeakAnnotationEditSession> {
    const session = new LocalWeakAnnotationEditSession(pages);
    return AbortablePromise.resolveValue(session);
  }
}

class LocalWeakAnnotationEditSession implements WeakAnnotationEditSession {
  readonly id = 'local-noop';
  readonly expiresAt = Number.MAX_SAFE_INTEGER;
  readonly heartbeatIntervalMs = Number.MAX_SAFE_INTEGER;
  private _pages: readonly PageRef[];

  constructor(pages: readonly PageRef[]) {
    this._pages = [...pages];
  }

  get pages(): readonly PageRef[] {
    return this._pages;
  }

  covers(page: PageRef): boolean {
    return this._pages.some((p) => p.pageObjectNumber === page.pageObjectNumber);
  }

  updatePages(pages: readonly PageRef[]): AbortablePromise<void> {
    this._pages = [...pages];
    return AbortablePromise.resolveValue(undefined);
  }

  heartbeat(): AbortablePromise<void> {
    return AbortablePromise.resolveValue(undefined);
  }

  release(): AbortablePromise<void> {
    this._pages = [];
    return AbortablePromise.resolveValue(undefined);
  }
}
