import {
  AbortablePromise,
  EngineError,
  EngineErrorCode,
  changeEvents,
  isUndoChange,
  opIdOf,
  resolveChangeResources,
  wirePack,
  type Change,
  type ChangeResult,
  type WriteOptions,
} from '@embedpdf/engine-core/runtime';
import type { SessionEventPublisher } from '@embedpdf/engine-services';

import type { ScopeGuard } from '../scope';
import type { JobId, WorkerResultPayload } from '../worker/protocol';
import type { JobQueue } from '../worker/WorkerQueue';

interface DocClosedView {
  isClosed(): boolean;
}

/**
 * `doc.apply`: one change, one job. The worker checks every op against the
 * change's authority inside the write, as each single verb's job does (an
 * undo's ops are only known there), so nothing about the ops is checked
 * here.
 *
 * The change's events are published once the worker confirms, all sharing
 * its `opId`. A retry the worker answers from its record of the first call
 * publishes nothing: that call already did.
 */
export class LocalDocumentChanges {
  constructor(
    private readonly docId: string,
    private readonly queue: JobQueue,
    private readonly view: DocClosedView,
    private readonly guard: ScopeGuard,
    private readonly publisher: SessionEventPublisher,
  ) {}

  apply(change: Change, options?: WriteOptions): AbortablePromise<ChangeResult> {
    if (this.view.isClosed()) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, `document not open: ${this.docId}`),
      );
    }
    let opId: string;
    try {
      opId = opIdOf(options);
    } catch (err) {
      return AbortablePromise.rejectReason(err);
    }
    // An empty change writes nothing, so nothing goes to the worker.
    if (!isUndoChange(change) && change.ops.length === 0) {
      return AbortablePromise.resolveValue<ChangeResult>({
        items: [],
        meta: { affectedPages: [], cacheDelta: null, opId, undoable: false },
      });
    }
    const authority = this.guard.changeAuthority();
    const docId = this.docId;
    // Queued now, so it keeps its place among this document's calls while
    // its bytes are read.
    const submission = this.queue.enqueue<WorkerResultPayload>({
      line: { effect: 'write', docId },
      buildPack: async (jobId: JobId) => {
        const wire = await resolveChangeResources(change);
        return wirePack(
          {
            kind: 'document.apply',
            effect: 'write',
            jobId,
            opId,
            docId,
            change: wire.change,
            authority,
          },
          wire.buffers,
        );
      },
    });
    return AbortablePromise.run<ChangeResult>(async (signal) => {
      const onAbort = () => submission.abort(signal.reason);
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
      const payload = await submission;
      if (payload.tag !== 'document.apply') {
        throw new EngineError(EngineErrorCode.WireFormat, `unexpected payload tag: ${payload.tag}`);
      }
      if (!payload.replayed) {
        const undoOf = isUndoChange(change) ? change.undoOf : undefined;
        this.publisher.publishChange(opId, changeEvents(payload.result), undoOf);
      }
      return payload.result;
    });
  }
}
