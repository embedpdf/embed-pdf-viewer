import {
  AbortablePromise,
  EngineError,
  EngineErrorCode,
  opIdOf,
  wirePack,
  type PageMeasureService,
  type PdfMeasure,
  type PageMeasurementViewportList,
  type PageScaleResult,
  type WorkerResultPayload,
  type PageRef,
  type WriteOptions,
} from '@embedpdf/engine-core/runtime';
import type { SessionEventPublisher } from '@embedpdf/engine-services';
import type { ScopeGuard } from '../scope';
import type { JobQueue } from '../worker/WorkerQueue';

export class LocalPageMeasureService implements PageMeasureService {
  constructor(
    private readonly docId: string,
    private readonly ref: PageRef,
    private readonly queue: JobQueue,
    private readonly view: { isClosed(): boolean },
    private readonly guard: ScopeGuard,
    private readonly publisher: SessionEventPublisher,
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
  setScale(measure: PdfMeasure | null, options?: WriteOptions): AbortablePromise<PageScaleResult> {
    let opId: string;
    try {
      opId = opIdOf(options);
      this.check('doc.annotate.modify');
    } catch (err) {
      return AbortablePromise.rejectReason(err);
    }
    const docId = this.docId;
    const page = this.ref;
    // Built a microtask later: the job takes its place among this document's
    // calls now, and an abort right after the call still takes it out before
    // it reaches the worker.
    const submission = this.queue.enqueue<WorkerResultPayload>({
      line: { effect: 'write', docId, page },
      buildPack: async (jobId) =>
        wirePack({ kind: 'measure.setScale', effect: 'write', jobId, docId, page, measure }),
    });
    return AbortablePromise.run(async (signal) => {
      const payload = await this.wait(submission, signal);
      if (payload.tag !== 'measure.setScale')
        throw new EngineError(EngineErrorCode.WireFormat, 'Unexpected scale response');
      this.publisher.publishWrite(opId, { type: 'pages.scaleSet', ...payload.result });
      return payload.result;
    });
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
