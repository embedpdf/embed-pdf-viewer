import {
  AbortablePromise,
  EngineError,
  EngineErrorCode,
  wirePack,
  type PageMeasureService,
  type PdfMeasure,
  type PageMeasurementViewportList,
  type PageScaleResult,
  type WorkerResultPayload,
  type PageRef,
} from '@embedpdf/engine-core/runtime';
import type { SessionEventPublisher } from '@embedpdf/engine-services';
import type { ScopeGuard } from '../scope';
import { Priority } from '../worker/Priority';
import type { WorkerQueue } from '../worker/WorkerQueue';

export class LocalPageMeasureService implements PageMeasureService {
  constructor(
    private readonly docId: string,
    private readonly ref: PageRef,
    private readonly queue: WorkerQueue,
    private readonly view: { isClosed(): boolean },
    private readonly guard: ScopeGuard,
    private readonly publisher: SessionEventPublisher,
  ) {}
  listViewports(): AbortablePromise<PageMeasurementViewportList> {
    return AbortablePromise.run(async (signal) => {
      this.check('doc.open');
      const submission = this.queue.enqueue<WorkerResultPayload>(
        {
          buildPack: (jobId) =>
            wirePack({
              kind: 'measure.viewports',
              jobId,
              docId: this.docId,
              page: this.ref,
            }),
        },
        { priority: Priority.MEDIUM },
      );
      const payload = await this.wait(submission, signal);
      if (payload.tag !== 'measure.viewports')
        throw new EngineError(EngineErrorCode.WireFormat, 'Unexpected viewport response');
      return { viewports: payload.viewports };
    });
  }
  setScale(measure: PdfMeasure | null): AbortablePromise<PageScaleResult> {
    return AbortablePromise.run(async (signal) => {
      // Allow immediate cancellation before an inline transport can apply the write.
      await Promise.resolve();
      signal.throwIfAborted();
      this.check('doc.annotate.modify');
      const submission = this.queue.enqueue<WorkerResultPayload>(
        {
          buildPack: (jobId) =>
            wirePack({
              kind: 'measure.setScale',
              jobId,
              docId: this.docId,
              page: this.ref,
              measure,
            }),
        },
        { priority: Priority.HIGH },
      );
      const payload = await this.wait(submission, signal);
      if (payload.tag !== 'measure.setScale')
        throw new EngineError(EngineErrorCode.WireFormat, 'Unexpected scale response');
      this.publisher.publishLocal({ type: 'pages.scaleSet', ...payload.result });
      return payload.result;
    });
  }
  private check(cap: 'doc.open' | 'doc.annotate.modify'): void {
    if (this.view.isClosed())
      throw new EngineError(EngineErrorCode.DocNotOpen, `Document not open: ${this.docId}`);
    this.guard.assertCapability(cap);
  }
  private async wait(
    submission: ReturnType<WorkerQueue['enqueue']>,
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
