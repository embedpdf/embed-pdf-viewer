import {
  AbortablePromise,
  EngineError,
  EngineErrorCode,
  wirePack,
  type DocumentRedactionService,
  type RedactionApplyResult,
  type RedactionApplyScope,
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
 * Document-scoped redaction apply for the local engine (see
 * `DocumentRedactionService` for the two-stage model and the layer trust
 * boundary). Funnels through the same in-process worker as every other
 * mutation, so an apply is sequenced against in-flight annotation writes.
 */
export class LocalDocumentRedactionService implements DocumentRedactionService {
  constructor(
    private readonly docId: string,
    private readonly queue: WorkerQueue,
    private readonly view: DocClosedView,
    private readonly guard: ScopeGuard,
    private readonly publisher: SessionEventPublisher,
  ) {}

  apply(scope: RedactionApplyScope): AbortablePromise<RedactionApplyResult> {
    if (this.view.isClosed()) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, `document not open: ${this.docId}`),
      );
    }
    try {
      // Apply rewrites page content and removes annotations (flatten's dual
      // gate), and information destruction is additionally its own granted
      // power: `doc.redact` narrows the gate rather than replacing it.
      this.guard.assertCapability('doc.pages.modify');
      this.guard.assertCapability('doc.annotate.modify');
      this.guard.assertCapability('doc.redact');
    } catch (error) {
      return AbortablePromise.rejectReason(error);
    }
    const docId = this.docId;
    const submission = this.queue.enqueue<WorkerResultPayload>(
      {
        buildPack: (jobId: JobId) => wirePack({ kind: 'redaction.apply', jobId, docId, scope }),
      },
      { priority: Priority.HIGH },
    );
    return AbortablePromise.run<RedactionApplyResult>(async (signal) => {
      const onAbort = () => submission.abort(signal.reason);
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
      const payload = await submission;
      if (payload.tag !== 'redaction.apply') {
        throw new EngineError(EngineErrorCode.WireFormat, `unexpected payload tag: ${payload.tag}`);
      }
      if (payload.result.meta !== null) {
        this.publisher.publishLocal({
          type: 'redaction.applied',
          ...payload.result,
        });
      }
      return payload.result;
    });
  }
}
