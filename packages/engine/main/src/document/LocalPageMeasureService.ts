import {
  AbortablePromise,
  EngineError,
  EngineErrorCode,
  opIdOf,
  wirePack,
  type PageMeasureService,
  type PdfMeasure,
  type PageMeasurementViewportList,
  type DocumentPagesService,
  type PageScaleResult,
  type WorkerResultPayload,
  type PageRef,
  type WriteOptions,
} from '@embedpdf/engine-core/runtime';

import type { ScopeGuard } from '../scope';
import type { JobQueue } from '../worker/WorkerQueue';

export class LocalPageMeasureService implements PageMeasureService {
  constructor(
    private readonly docId: string,
    private readonly ref: PageRef,
    private readonly queue: JobQueue,
    private readonly view: { isClosed(): boolean },
    private readonly guard: ScopeGuard,
    private readonly setScales: DocumentPagesService['setScale'],
  ) {}
  listViewports(): AbortablePromise<PageMeasurementViewportList> {
    return AbortablePromise.run(async (signal) => {
      this.check('doc.open');
      const submission = this.queue.enqueue<WorkerResultPayload>({
        buildPack: (jobId) =>
          wirePack({
            kind: 'measure.viewports',
            effect: 'read',
            jobId,
            docId: this.docId,
            page: this.ref,
          }),
      });
      const payload = await this.wait(submission, signal);
      if (payload.tag !== 'measure.viewports')
        throw new EngineError(EngineErrorCode.WireFormat, 'Unexpected viewport response');
      return { viewports: payload.viewports };
    });
  }
  /** A one-page `doc.pages.setScale`: one change, as every scale change is. */
  setScale(measure: PdfMeasure | null, options?: WriteOptions): AbortablePromise<PageScaleResult> {
    return this.setScales([this.ref], measure, options);
  }
  private check(cap: 'doc.open' | 'doc.annotate.modify'): void {
    if (this.view.isClosed())
      throw new EngineError(EngineErrorCode.DocNotOpen, `Document not open: ${this.docId}`);
    this.guard.assertCapability(cap);
  }
  private async wait(
    submission: ReturnType<JobQueue['enqueue']>,
    signal: AbortSignal,
  ): Promise<WorkerResultPayload> {
    const abort = () => submission.abort(signal.reason);
    if (signal.aborted) abort();
    else signal.addEventListener('abort', abort, { once: true });
    try {
      return (await submission) as WorkerResultPayload;
    } finally {
      signal.removeEventListener('abort', abort);
    }
  }
}
