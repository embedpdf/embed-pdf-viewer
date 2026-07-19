import {
  AbortablePromise,
  EngineError,
  EngineErrorCode,
  wirePack,
  type AnnotationListPageSnapshot,
  type AnnotationListSnapshotAllPages,
  type DocumentAnnotationsService,
  type PageObjectNumber,
  type WeakAnnotationEditSession,
} from '@embedpdf/engine-core/runtime';

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
  ) {}

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

  listRaw(pageObjectNumber: PageObjectNumber): AbortablePromise<AnnotationListPageSnapshot> {
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
            pageObjectNumber,
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

  beginWeakEdit(
    pageObjectNumbers: readonly PageObjectNumber[],
  ): AbortablePromise<WeakAnnotationEditSession> {
    const session = new LocalWeakAnnotationEditSession(pageObjectNumbers);
    return AbortablePromise.resolveValue(session);
  }
}

class LocalWeakAnnotationEditSession implements WeakAnnotationEditSession {
  readonly id = 'local-noop';
  readonly expiresAt = Number.MAX_SAFE_INTEGER;
  readonly heartbeatIntervalMs = Number.MAX_SAFE_INTEGER;
  private pages: readonly PageObjectNumber[];

  constructor(pageObjectNumbers: readonly PageObjectNumber[]) {
    this.pages = [...pageObjectNumbers];
  }

  get pageObjectNumbers(): readonly PageObjectNumber[] {
    return this.pages;
  }

  covers(pageObjectNumber: PageObjectNumber): boolean {
    return this.pages.includes(pageObjectNumber);
  }

  updatePages(pageObjectNumbers: readonly PageObjectNumber[]): AbortablePromise<void> {
    this.pages = [...pageObjectNumbers];
    return AbortablePromise.resolveValue(undefined);
  }

  heartbeat(): AbortablePromise<void> {
    return AbortablePromise.resolveValue(undefined);
  }

  release(): AbortablePromise<void> {
    this.pages = [];
    return AbortablePromise.resolveValue(undefined);
  }
}
