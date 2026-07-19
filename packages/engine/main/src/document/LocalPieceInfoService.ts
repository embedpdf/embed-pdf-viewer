import {
  AbortablePromise,
  EngineError,
  EngineErrorCode,
  wirePack,
  type PageObjectNumber,
  type PieceInfoPatch,
  type PieceInfoService,
  type PieceInfoSnapshot,
} from '@embedpdf/engine-core/runtime';

import type { ScopeGuard } from '../scope';
import { Priority } from '../worker/Priority';
import type { JobId, WorkerResultPayload } from '../worker/protocol';
import type { WorkerQueue } from '../worker/WorkerQueue';

interface DocClosedView {
  isClosed(): boolean;
}

/**
 * `/PieceInfo` access for the local engine. ONE class serves both levels —
 * `pageObjectNumber` undefined targets the document catalog, set targets a
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
    private readonly queue: WorkerQueue,
    private readonly view: DocClosedView,
    private readonly guard: ScopeGuard,
    private readonly pageObjectNumber?: PageObjectNumber,
  ) {}

  read(application: string): AbortablePromise<PieceInfoSnapshot | null> {
    const rejected = this.gate('doc.open');
    if (rejected) return rejected as AbortablePromise<PieceInfoSnapshot | null>;
    const { docId, pageObjectNumber } = this;
    const submission = this.queue.enqueue<WorkerResultPayload>(
      {
        buildPack: (jobId: JobId) =>
          wirePack({ kind: 'pieceInfo.read', jobId, docId, pageObjectNumber, application }),
      },
      { priority: Priority.MEDIUM },
    );
    return AbortablePromise.run<PieceInfoSnapshot | null>(async (signal) => {
      const payload = await this.await(submission, signal);
      if (payload.tag !== 'pieceInfo.read') {
        throw new EngineError(EngineErrorCode.WireFormat, `unexpected payload tag: ${payload.tag}`);
      }
      return payload.snapshot;
    });
  }

  update(application: string, patch: PieceInfoPatch): AbortablePromise<void> {
    const rejected = this.gate('doc.metadata.modify');
    if (rejected) return rejected as AbortablePromise<void>;
    const { docId, pageObjectNumber } = this;
    const submission = this.queue.enqueue<WorkerResultPayload>(
      {
        buildPack: (jobId: JobId) =>
          wirePack({
            kind: 'pieceInfo.update',
            jobId,
            docId,
            pageObjectNumber,
            application,
            patch,
          }),
      },
      { priority: Priority.HIGH },
    );
    return AbortablePromise.run<void>(async (signal) => {
      const payload = await this.await(submission, signal);
      if (payload.tag !== 'pieceInfo.update') {
        throw new EngineError(EngineErrorCode.WireFormat, `unexpected payload tag: ${payload.tag}`);
      }
    });
  }

  applications(): AbortablePromise<string[]> {
    const rejected = this.gate('doc.open');
    if (rejected) return rejected as AbortablePromise<string[]>;
    const { docId, pageObjectNumber } = this;
    const submission = this.queue.enqueue<WorkerResultPayload>(
      {
        buildPack: (jobId: JobId) =>
          wirePack({ kind: 'pieceInfo.applications', jobId, docId, pageObjectNumber }),
      },
      { priority: Priority.MEDIUM },
    );
    return AbortablePromise.run<string[]>(async (signal) => {
      const payload = await this.await(submission, signal);
      if (payload.tag !== 'pieceInfo.applications') {
        throw new EngineError(EngineErrorCode.WireFormat, `unexpected payload tag: ${payload.tag}`);
      }
      return payload.applications;
    });
  }

  clear(application: string): AbortablePromise<void> {
    const rejected = this.gate('doc.metadata.modify');
    if (rejected) return rejected as AbortablePromise<void>;
    const { docId, pageObjectNumber } = this;
    const submission = this.queue.enqueue<WorkerResultPayload>(
      {
        buildPack: (jobId: JobId) =>
          wirePack({ kind: 'pieceInfo.clear', jobId, docId, pageObjectNumber, application }),
      },
      { priority: Priority.HIGH },
    );
    return AbortablePromise.run<void>(async (signal) => {
      const payload = await this.await(submission, signal);
      if (payload.tag !== 'pieceInfo.clear') {
        throw new EngineError(EngineErrorCode.WireFormat, `unexpected payload tag: ${payload.tag}`);
      }
    });
  }

  /** Shared closed-check + capability gate; null when the call may proceed. */
  private gate(capability: 'doc.open' | 'doc.metadata.modify'): AbortablePromise<never> | null {
    if (this.view.isClosed()) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, `document not open: ${this.docId}`),
      );
    }
    try {
      this.guard.assertCapability(capability);
    } catch (err) {
      return AbortablePromise.rejectReason(err);
    }
    return null;
  }

  /** Wire an outer abort into the queued submission (the house idiom). */
  private async await(
    submission: ReturnType<WorkerQueue['enqueue']>,
    signal: AbortSignal,
  ): Promise<WorkerResultPayload> {
    const onAbort = () => submission.abort(signal.reason);
    if (signal.aborted) onAbort();
    else signal.addEventListener('abort', onAbort, { once: true });
    return (await submission) as WorkerResultPayload;
  }
}
