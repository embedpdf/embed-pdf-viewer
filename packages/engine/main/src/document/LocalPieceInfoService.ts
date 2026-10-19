import {
  AbortablePromise,
  EngineError,
  EngineErrorCode,
  opIdOf,
  wirePack,
  type PieceInfoDeleteResult,
  type PieceInfoPatch,
  type PieceInfoService,
  type PieceInfoUpdateResult,
  type PieceInfoSnapshot,
  type PageRef,
  type WriteOptions,
} from '@embedpdf/engine-core/runtime';

import type { ScopeGuard } from '../scope';
import type { JobId, WorkerResultPayload } from '../worker/protocol';
import type { JobQueue } from '../worker/WorkerQueue';

interface DocClosedView {
  isClosed(): boolean;
}

/**
 * `/PieceInfo` access for the local engine. One class serves both levels —
 * `page` undefined targets the document catalog, set targets a
 * page — mirroring the wire protocol's single job family.
 *
 * Authorization: reads ride `doc.open` (session-level read, like
 * `pages.list`); writes ride `doc.metadata.modify` — piece data is
 * metadata-shaped private state, so it reuses the metadata write gate
 * rather than minting a new scope. Revisit if a cloud consumer needs
 * finer granularity.
 */
export class LocalPieceInfoService implements PieceInfoService {
  constructor(
    private readonly docId: string,
    private readonly queue: JobQueue,
    private readonly view: DocClosedView,
    private readonly guard: ScopeGuard,
    private readonly page?: PageRef,
  ) {}

  get(application: string): AbortablePromise<PieceInfoSnapshot | null> {
    const read = this.gate('doc.open');
    if ('rejected' in read) return read.rejected;
    const { docId, page } = this;
    const submission = this.queue.enqueue<WorkerResultPayload>({
      buildPack: (jobId: JobId) =>
        wirePack({ kind: 'pieceInfo.read', effect: 'read', jobId, docId, page, application }),
    });
    return AbortablePromise.run<PieceInfoSnapshot | null>(async (signal) => {
      const payload = await this.await(submission, signal);
      if (payload.tag !== 'pieceInfo.read') {
        throw new EngineError(EngineErrorCode.WireFormat, `unexpected payload tag: ${payload.tag}`);
      }
      return payload.snapshot;
    });
  }

  update(
    application: string,
    patch: PieceInfoPatch,
    options?: WriteOptions,
  ): AbortablePromise<PieceInfoUpdateResult> {
    const write = this.gate('doc.metadata.modify', options);
    if ('rejected' in write) return write.rejected;
    const { opId } = write;
    const { docId, page } = this;
    const submission = this.queue.enqueue<WorkerResultPayload>({
      buildPack: (jobId: JobId) =>
        wirePack({
          kind: 'pieceInfo.update',
          effect: 'write',
          jobId,
          opId,
          docId,
          page,
          application,
          patch,
        }),
    });
    return AbortablePromise.run<PieceInfoUpdateResult>(async (signal) => {
      const payload = await this.await(submission, signal);
      if (payload.tag !== 'pieceInfo.update') {
        throw new EngineError(EngineErrorCode.WireFormat, `unexpected payload tag: ${payload.tag}`);
      }
      return payload.result;
    });
  }

  list(): AbortablePromise<string[]> {
    const read = this.gate('doc.open');
    if ('rejected' in read) return read.rejected;
    const { docId, page } = this;
    const submission = this.queue.enqueue<WorkerResultPayload>({
      buildPack: (jobId: JobId) =>
        wirePack({ kind: 'pieceInfo.applications', effect: 'read', jobId, docId, page }),
    });
    return AbortablePromise.run<string[]>(async (signal) => {
      const payload = await this.await(submission, signal);
      if (payload.tag !== 'pieceInfo.applications') {
        throw new EngineError(EngineErrorCode.WireFormat, `unexpected payload tag: ${payload.tag}`);
      }
      return payload.applications;
    });
  }

  delete(application: string, options?: WriteOptions): AbortablePromise<PieceInfoDeleteResult> {
    const write = this.gate('doc.metadata.modify', options);
    if ('rejected' in write) return write.rejected;
    const { opId } = write;
    const { docId, page } = this;
    const submission = this.queue.enqueue<WorkerResultPayload>({
      buildPack: (jobId: JobId) =>
        wirePack({ kind: 'pieceInfo.delete', effect: 'write', jobId, opId, docId, page, application }),
    });
    return AbortablePromise.run<PieceInfoDeleteResult>(async (signal) => {
      const payload = await this.await(submission, signal);
      if (payload.tag !== 'pieceInfo.delete') {
        throw new EngineError(EngineErrorCode.WireFormat, `unexpected payload tag: ${payload.tag}`);
      }
      return payload.result;
    });
  }

  /**
   * Shared closed-check + capability gate, and for a write the `opId` rule:
   * the call's `opId` (the caller's, else a fresh one; a read ignores it),
   * or the refusal.
   */
  private gate(
    capability: 'doc.open' | 'doc.metadata.modify',
    options?: WriteOptions,
  ): { opId: string } | { rejected: AbortablePromise<never> } {
    if (this.view.isClosed()) {
      return {
        rejected: AbortablePromise.rejectReason(
          new EngineError(EngineErrorCode.DocNotOpen, `document not open: ${this.docId}`),
        ),
      };
    }
    try {
      const opId = opIdOf(options);
      this.guard.assertCapability(capability);
      return { opId };
    } catch (err) {
      return { rejected: AbortablePromise.rejectReason(err) };
    }
  }

  /** Wire an outer abort into the queued submission (the house idiom). */
  private async await(
    submission: ReturnType<JobQueue['enqueue']>,
    signal: AbortSignal,
  ): Promise<WorkerResultPayload> {
    const onAbort = () => submission.abort(signal.reason);
    if (signal.aborted) onAbort();
    else signal.addEventListener('abort', onAbort, { once: true });
    return (await submission) as WorkerResultPayload;
  }
}
