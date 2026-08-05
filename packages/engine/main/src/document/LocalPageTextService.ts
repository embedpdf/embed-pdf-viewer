import {
  AbortablePromise,
  EngineError,
  EngineErrorCode,
  wirePack,
  type PageObjectNumber,
  type PageTextService,
  type PageTextSnapshot,
} from '@embedpdf/engine-core/runtime';

import type { ScopeGuard } from '../scope';
import { Priority } from '../worker/Priority';
import type { JobId, WorkerResultPayload } from '../worker/protocol';
import type { WorkerQueue } from '../worker/WorkerQueue';

interface DocClosedView {
  isClosed(): boolean;
}

/**
 * Page-scoped text service. `read()` enqueues a `pages.text` worker
 * request — the host runs `PageTextReader` against the same PDFium
 * session the annotations service uses, so a `read()` issued
 * immediately after a mutation observes the post-mutation page.
 *
 * Mirrors `LocalPageAnnotationsService.list()` so the worker plumbing
 * is symmetric across every per-page read.
 */
export class LocalPageTextService implements PageTextService {
  constructor(
    private readonly docId: string,
    private readonly pageObjectNumber: PageObjectNumber,
    private readonly queue: WorkerQueue,
    private readonly view: DocClosedView,
    private readonly guard: ScopeGuard,
  ) {}

  read(): AbortablePromise<PageTextSnapshot> {
    if (this.view.isClosed()) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, `document not open: ${this.docId}`),
      );
    }
    // Reading per-page text requires the same capability as the
    // cloud's /text endpoint (the route uses `requireResource`
    // → `doc.text.copy`). Cloud parity: same scope grants both.
    try {
      this.guard.assertCapability('doc.text.copy');
    } catch (err) {
      return AbortablePromise.rejectReason(err);
    }
    const docId = this.docId;
    const pon = this.pageObjectNumber;
    const submission = this.queue.enqueue<WorkerResultPayload>(
      {
        buildPack: (jobId: JobId) =>
          wirePack({
            kind: 'pages.text',
            jobId,
            docId,
            pageObjectNumber: pon,
          }),
      },
      { priority: Priority.MEDIUM },
    );
    return AbortablePromise.run<PageTextSnapshot>(async (signal) => {
      const onAbort = () => submission.abort(signal.reason);
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
      const payload = await submission;
      if (payload.tag !== 'pages.text') {
        throw new EngineError(EngineErrorCode.WireFormat, `unexpected payload tag: ${payload.tag}`);
      }
      return payload.snapshot;
    });
  }
}
