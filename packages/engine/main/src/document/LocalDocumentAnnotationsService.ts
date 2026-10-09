import {
  AbortablePromise,
  EngineError,
  EngineErrorCode,
  annotationImportFacts,
  opIdOf,
  wirePack,
  type AnnotationBundle,
  type AnnotationExportSelection,
  type AnnotationImportOptions,
  type AnnotationImportResult,
  type AnnotationList,
  type AnnotationListOptions,
  type DocumentAnnotationsService,
} from '@embedpdf/engine-core/runtime';
import type { SessionEventPublisher } from '@embedpdf/engine-services';

import { ownedResources, transferableResources } from './bundleResources';
import type { ScopeGuard } from '../scope';
import type { JobId, WorkerResultPayload } from '../worker/protocol';
import type { JobQueue } from '../worker/WorkerQueue';

interface DocClosedView {
  isClosed(): boolean;
}

/**
 * Document-scoped annotation reads, dispatched through the same
 * JobQueue every other local read uses. The worker host reads them with
 * `RawAnnotationReader.list`.
 */
export class LocalDocumentAnnotationsService implements DocumentAnnotationsService {
  constructor(
    private readonly docId: string,
    private readonly queue: JobQueue,
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
    // The annotations and the bytes beside them: `downloadResource`'s gate too.
    try {
      this.guard.assertCapability('doc.annotate.read');
      this.guard.assertCapability('doc.download');
    } catch (err) {
      return AbortablePromise.rejectReason(err);
    }
    const docId = this.docId;
    const submission = this.queue.enqueue<WorkerResultPayload>({
      buildPack: (jobId: JobId) =>
        wirePack({
          kind: 'annotations.export',
          effect: 'snapshot',
          jobId,
          docId,
          selection: { ...selection },
        }),
    });
    return AbortablePromise.run<AnnotationBundle>(async (signal) => {
      const onAbort = () => submission.abort(signal.reason);
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
      const payload = await submission;
      if (payload.tag !== 'annotations.export') {
        throw new EngineError(EngineErrorCode.WireFormat, `unexpected payload tag: ${payload.tag}`);
      }
      const { bundle } = payload;
      return { ...bundle, resources: ownedResources(bundle.resources) };
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
    let opId: string;
    try {
      opId = opIdOf(options);
      if (attribution === 'restore') {
        // Restoring writes attribution that isn't the session's.
        this.guard.assertCapability('doc.annotate.modify');
        this.guard.assertCapability('doc.annotate.import');
      } else {
        // Each item is made as a create makes it, and needs what that create needs.
        this.assertMayCreate(bundle);
      }
    } catch (err) {
      return AbortablePromise.rejectReason(err);
    }
    // The session: whom `stamp` attributes to, whom `restore` records as `importedBy`.
    const actor = this.guard.actorForCreate();
    const docId = this.docId;
    return AbortablePromise.run<AnnotationImportResult>(async (signal) => {
      const resources = transferableResources(bundle.resources);
      const submission = this.queue.enqueue<WorkerResultPayload>({
        buildPack: (jobId: JobId) =>
          wirePack(
            {
              kind: 'annotations.import',
              effect: 'write',
              jobId,
              opId,
              docId,
              bundle: { ...bundle, resources },
              ...(options.pages !== undefined ? { pages: options.pages } : {}),
              attribution,
              ...(actor ? { actor } : {}),
            },
            Object.values(resources),
          ),
      });
      const onAbort = () => submission.abort(signal.reason);
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
      const payload = await submission;
      if (payload.tag !== 'annotations.import') {
        throw new EngineError(EngineErrorCode.WireFormat, `unexpected payload tag: ${payload.tag}`);
      }
      this.publisher.publishWrite(
        opId,
        ...annotationImportFacts(payload.result).map((fact) => ({
          type: 'annotations.created' as const,
          ...fact,
        })),
      );
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
    // An empty bundle still takes the authority to create.
    if (groups.size === 0) groups.add(undefined);
    for (const groupId of groups) {
      if (groupId !== undefined && groupId !== ownGroup) this.guard.assertSetGroup(groupId);
      this.guard.assertCollab('create', this.guard.targetForSelfCreate(groupId));
    }
  }

  list(options: AnnotationListOptions = {}): AbortablePromise<AnnotationList> {
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
    const pages = options.pages === undefined ? undefined : [...options.pages];
    const submission = this.queue.enqueue<WorkerResultPayload>({
      buildPack: (jobId: JobId) =>
        wirePack({
          kind: 'annotations.list',
          effect: 'read',
          jobId,
          docId,
          ...(pages ? { pages } : {}),
        }),
    });
    return AbortablePromise.run<AnnotationList>(async (signal) => {
      const onAbort = () => submission.abort(signal.reason);
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
      const payload = await submission;
      if (payload.tag !== 'annotations.list') {
        throw new EngineError(EngineErrorCode.WireFormat, `unexpected payload tag: ${payload.tag}`);
      }
      return payload.list;
    });
  }
}
