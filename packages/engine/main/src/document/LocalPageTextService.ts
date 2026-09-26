import {
  AbortablePromise,
  createTextLayout,
  EngineError,
  EngineErrorCode,
  sliceText,
  wirePack,
  type PageTextService,
  type PageTextSnapshot,
  type PageRef,
  type TextLayout,
  type TextRange,
} from '@embedpdf/engine-core/runtime';

import type { ScopeGuard } from '../scope';
import { Priority } from '../worker/Priority';
import type { JobId, WorkerResultPayload } from '../worker/protocol';
import type { WorkerQueue } from '../worker/WorkerQueue';

interface DocClosedView {
  isClosed(): boolean;
}

/**
 * Page-scoped text service. `get()` enqueues a `pages.text` worker
 * request and `layout()` a `pages.geometry` one — the host runs them
 * against the same PDFium session the annotations service uses, so a read
 * issued immediately after a mutation observes the post-mutation page.
 */
export class LocalPageTextService implements PageTextService {
  constructor(
    private readonly docId: string,
    private readonly ref: PageRef,
    private readonly queue: WorkerQueue,
    private readonly view: DocClosedView,
    private readonly guard: ScopeGuard,
  ) {}

  get(): AbortablePromise<PageTextSnapshot> {
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
    const ref = this.ref;
    const submission = this.queue.enqueue<WorkerResultPayload>(
      {
        buildPack: (jobId: JobId) =>
          wirePack({
            kind: 'pages.text',
            jobId,
            docId,
            page: ref,
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

  slice(range: TextRange): AbortablePromise<string> {
    return AbortablePromise.run(async (signal) =>
      sliceText(await this.get().abortWith(signal), range),
    );
  }

  layout(): AbortablePromise<TextLayout> {
    if (this.view.isClosed()) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, `document not open: ${this.docId}`),
      );
    }
    // Cloud parity: /geometry gates on `doc.text.select` (where text is,
    // not what it says: screen selection, search hit rendering).
    try {
      this.guard.assertCapability('doc.text.select');
    } catch (err) {
      return AbortablePromise.rejectReason(err);
    }
    const docId = this.docId;
    const ref = this.ref;
    const submission = this.queue.enqueue<WorkerResultPayload>(
      {
        buildPack: (jobId: JobId) => wirePack({ kind: 'pages.geometry', jobId, docId, page: ref }),
      },
      { priority: Priority.MEDIUM },
    );
    return AbortablePromise.run<TextLayout>(async (signal) => {
      const onAbort = () => submission.abort(signal.reason);
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
      const payload = await submission;
      if (payload.tag !== 'pages.geometry') {
        throw new EngineError(EngineErrorCode.WireFormat, `unexpected payload tag: ${payload.tag}`);
      }
      return createTextLayout(payload.snapshot);
    });
  }
}
