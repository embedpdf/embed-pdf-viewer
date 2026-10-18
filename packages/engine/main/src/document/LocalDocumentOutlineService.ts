import {
  AbortablePromise,
  EngineError,
  EngineErrorCode,
  wirePack,
  type DocumentOutline,
} from '@embedpdf/engine-core/runtime';

import type { ScopeGuard } from '../scope';
import type { JobId, WorkerResultPayload } from '../worker/protocol';
import type { JobQueue } from '../worker/WorkerQueue';

interface DocClosedView {
  isClosed(): boolean;
}

/**
 * The read behind the local `doc.outline`: every item, depth first. Its verbs
 * are one-op changes through `doc.apply` (`outlineVerbs`), so the worker
 * checks `doc.outline.modify` on each op, as on the server.
 */
export function readLocalOutline(
  docId: string,
  queue: JobQueue,
  view: DocClosedView,
  guard: ScopeGuard,
): AbortablePromise<DocumentOutline> {
  if (view.isClosed()) {
    return AbortablePromise.rejectReason(
      new EngineError(EngineErrorCode.DocNotOpen, `document not open: ${docId}`),
    );
  }
  try {
    guard.assertCapability('doc.open');
  } catch (error) {
    return AbortablePromise.rejectReason(error);
  }
  const submission = queue.enqueue<WorkerResultPayload>({
    buildPack: (jobId: JobId) => wirePack({ kind: 'outline.read', effect: 'read', jobId, docId }),
  });
  return AbortablePromise.run(async (signal) => {
    const onAbort = () => submission.abort(signal.reason);
    if (signal.aborted) onAbort();
    else signal.addEventListener('abort', onAbort, { once: true });
    const payload = await submission;
    if (payload.tag !== 'outline.read') {
      throw new EngineError(EngineErrorCode.WireFormat, `unexpected payload tag: ${payload.tag}`);
    }
    return payload.outline;
  });
}
