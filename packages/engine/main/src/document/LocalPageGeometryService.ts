import {
  AbortablePromise,
  EngineError,
  EngineErrorCode,
  wirePack,
  type PageGeometryService,
  type PageGeometrySnapshot,
  type PageObjectNumber,
} from '@embedpdf/engine-core/runtime';

import type { ScopeGuard } from '../scope';
import { Priority } from '../worker/Priority';
import type { JobId, WorkerResultPayload } from '../worker/protocol';
import type { WorkerQueue } from '../worker/WorkerQueue';

interface DocClosedView {
  isClosed(): boolean;
}

export class LocalPageGeometryService implements PageGeometryService {
  constructor(
    private readonly docId: string,
    private readonly pageObjectNumber: PageObjectNumber,
    private readonly queue: WorkerQueue,
    private readonly view: DocClosedView,
    private readonly guard: ScopeGuard,
  ) {}

  read(): AbortablePromise<PageGeometrySnapshot> {
    if (this.view.isClosed()) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, `document not open: ${this.docId}`),
      );
    }
    // Cloud parity: /geometry gates on `doc.text.select` (the text-layout
    // permission used for screen selection / search hit rendering).
    try {
      this.guard.assertCapability('doc.text.select');
    } catch (err) {
      return AbortablePromise.rejectReason(err);
    }
    const docId = this.docId;
    const pon = this.pageObjectNumber;
    const submission = this.queue.enqueue<WorkerResultPayload>(
      {
        buildPack: (jobId: JobId) =>
          wirePack({
            kind: 'pages.geometry',
            jobId,
            docId,
            pageObjectNumber: pon,
          }),
      },
      { priority: Priority.MEDIUM },
    );
    return AbortablePromise.run<PageGeometrySnapshot>(async (signal) => {
      const onAbort = () => submission.abort(signal.reason);
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
      const payload = await submission;
      if (payload.tag !== 'pages.geometry') {
        throw new EngineError(EngineErrorCode.WireFormat, `unexpected payload tag: ${payload.tag}`);
      }
      return payload.snapshot;
    });
  }
}
