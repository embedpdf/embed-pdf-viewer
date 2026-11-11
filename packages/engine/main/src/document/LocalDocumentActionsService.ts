import {
  AbortablePromise,
  EngineError,
  EngineErrorCode,
  wirePack,
  type DocumentActionsService,
  type DocumentActionsSnapshot,
  type PageDestination,
} from '@embedpdf/engine-core/runtime';

import type { ScopeGuard } from '../scope';
import type { JobId, WorkerResultPayload } from '../worker/protocol';
import type { JobQueue, JobSpec } from '../worker/WorkerQueue';

interface DocClosedView {
  isClosed(): boolean;
}

export class LocalDocumentActionsService implements DocumentActionsService {
  constructor(
    private readonly docId: string,
    private readonly queue: JobQueue,
    private readonly view: DocClosedView,
    private readonly guard: ScopeGuard,
  ) {}

  get(): AbortablePromise<DocumentActionsSnapshot> {
    return this.run(
      (jobId) => wirePack({ kind: 'actions.read', effect: 'read', jobId, docId: this.docId }),
      'actions.read',
      (payload) => payload.snapshot,
    );
  }

  resolveNamedDestination(name: string): AbortablePromise<PageDestination | null> {
    return this.run(
      (jobId) =>
        wirePack({
          kind: 'actions.resolveNamedDestination',
          effect: 'read',
          jobId,
          docId: this.docId,
          name,
        }),
      'actions.resolveNamedDestination',
      (payload) => payload.destination,
    );
  }

  /** One read: refused on a closed document or without `doc.open`, the payload's tag checked. */
  private run<Tag extends WorkerResultPayload['tag'], T>(
    buildPack: JobSpec['buildPack'],
    tag: Tag,
    pick: (payload: Extract<WorkerResultPayload, { tag: Tag }>) => T,
  ): AbortablePromise<T> {
    if (this.view.isClosed()) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, `document not open: ${this.docId}`),
      );
    }
    try {
      this.guard.assertCapability('doc.open');
    } catch (error) {
      return AbortablePromise.rejectReason(error);
    }
    const submission = this.queue.enqueue<WorkerResultPayload>({ buildPack });
    return AbortablePromise.run(async (signal) => {
      const onAbort = () => submission.abort(signal.reason);
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
      const payload = await submission;
      if (payload.tag !== tag) {
        throw new EngineError(EngineErrorCode.WireFormat, `unexpected payload tag: ${payload.tag}`);
      }
      return pick(payload as Extract<WorkerResultPayload, { tag: Tag }>);
    });
  }
}
