import {
  AbortablePromise,
  EngineError,
  EngineErrorCode,
  wirePack,
  type DocumentSearchService,
  type SearchRequest,
  type SearchSlice,
} from '@embedpdf/engine-core/runtime';

import type { ScopeGuard } from '../scope';
import { Priority } from '../worker/Priority';
import type { JobId, WorkerResultPayload } from '../worker/protocol';
import type { WorkerQueue } from '../worker/WorkerQueue';

interface DocClosedView {
  isClosed(): boolean;
}

/**
 * Document-scoped search service. `'rects'` mode gates on
 * `doc.text.search`; `'full'` (snippets) additionally needs
 * `doc.text.copy` — a snippet IS extracted text, so the copy denial must
 * hold here too (cloud parity: the server's search route enforces the
 * same pair). The worker fans out to `SearchReader`, which serves page
 * text from the session's version-keyed corpus cache.
 */
export class LocalDocumentSearchService implements DocumentSearchService {
  constructor(
    private readonly docId: string,
    private readonly queue: WorkerQueue,
    private readonly view: DocClosedView,
    private readonly guard: ScopeGuard,
  ) {}

  query(request: SearchRequest): AbortablePromise<SearchSlice> {
    if (this.view.isClosed()) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, `document not open: ${this.docId}`),
      );
    }
    try {
      this.guard.assertCapability('doc.text.search');
      if ((request.mode ?? 'full') === 'full') {
        this.guard.assertCapability('doc.text.copy');
      }
    } catch (err) {
      return AbortablePromise.rejectReason(err);
    }

    const docId = this.docId;
    const submission = this.queue.enqueue<WorkerResultPayload>(
      {
        buildPack: (jobId: JobId) => wirePack({ kind: 'search.query', jobId, docId, request }),
      },
      // Search runs behind interactive work (renders, edits): a slice is
      // bounded but not small, and the next one can always wait a beat.
      { priority: Priority.LOW },
    );
    return AbortablePromise.run<SearchSlice>(async (signal) => {
      const onAbort = () => submission.abort(signal.reason);
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
      const payload = await submission;
      if (payload.tag !== 'search.query') {
        throw new EngineError(EngineErrorCode.WireFormat, `unexpected payload tag: ${payload.tag}`);
      }
      return payload.slice;
    });
  }
}
