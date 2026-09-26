import {
  AbortablePromise,
  EngineError,
  EngineErrorCode,
  wirePack,
  type AnalyzeInput,
  type ChangeAnalysis,
  type DigestAlgorithm,
  type DocumentSignaturesService,
  type FormFieldRef,
  type SignatureCancelResult,
  type SignatureCompleteInput,
  type SignatureCompleteResult,
  type SignaturePrepareInput,
  type SignaturePrepared,
  type SignatureSnapshot,
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
 * Document-scoped signatures service. Reads gate on `doc.forms.read`,
 * revision bytes on `doc.download`, signing on `doc.sign`. The worker
 * host serves every read from the session's version-keyed signature
 * model, over the bytes the document was loaded from.
 */
export class LocalDocumentSignaturesService implements DocumentSignaturesService {
  constructor(
    private readonly docId: string,
    private readonly queue: WorkerQueue,
    private readonly view: DocClosedView,
    private readonly guard: ScopeGuard,
    private readonly publisher: SessionEventPublisher,
  ) {}

  list(): AbortablePromise<SignatureSnapshot> {
    const rejected = this.gate('doc.forms.read');
    if (rejected) return rejected;
    const docId = this.docId;
    const submission = this.queue.enqueue<WorkerResultPayload>(
      { buildPack: (jobId: JobId) => wirePack({ kind: 'signatures.list', jobId, docId }) },
      { priority: Priority.MEDIUM },
    );
    return this.await(submission, 'signatures.list', (payload) => payload.snapshot);
  }

  getContents(field: FormFieldRef): AbortablePromise<Uint8Array> {
    const rejected = this.gate('doc.forms.read');
    if (rejected) return rejected;
    const docId = this.docId;
    const submission = this.queue.enqueue<WorkerResultPayload>(
      {
        buildPack: (jobId: JobId) =>
          wirePack({ kind: 'signatures.contents', jobId, docId, ref: field }),
      },
      { priority: Priority.MEDIUM },
    );
    return this.await(
      submission,
      'signatures.contents',
      (payload) => new Uint8Array(payload.bytes),
    );
  }

  getDigest(field: FormFieldRef, algorithm: DigestAlgorithm): AbortablePromise<Uint8Array> {
    const rejected = this.gate('doc.forms.read');
    if (rejected) return rejected;
    const docId = this.docId;
    const submission = this.queue.enqueue<WorkerResultPayload>(
      {
        buildPack: (jobId: JobId) =>
          wirePack({ kind: 'signatures.digest', jobId, docId, ref: field, algorithm }),
      },
      { priority: Priority.MEDIUM },
    );
    return this.await(submission, 'signatures.digest', (payload) => new Uint8Array(payload.digest));
  }

  downloadRevision(revisionIndex: number): AbortablePromise<Uint8Array> {
    const rejected = this.gate('doc.download');
    if (rejected) return rejected;
    if (!Number.isInteger(revisionIndex) || revisionIndex < 0) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.InvalidArg, 'revisionIndex must be a non-negative integer'),
      );
    }
    const docId = this.docId;
    const submission = this.queue.enqueue<WorkerResultPayload>(
      {
        buildPack: (jobId: JobId) =>
          wirePack({ kind: 'signatures.revisionBytes', jobId, docId, revisionIndex }),
      },
      { priority: Priority.MEDIUM },
    );
    return this.await(
      submission,
      'signatures.revisionBytes',
      (payload) => new Uint8Array(payload.bytes),
    );
  }

  analyze(input: AnalyzeInput): AbortablePromise<ChangeAnalysis> {
    const rejected = this.gate('doc.forms.read');
    if (rejected) return rejected;
    const docId = this.docId;
    const submission = this.queue.enqueue<WorkerResultPayload>(
      {
        buildPack: (jobId: JobId) => wirePack({ kind: 'signatures.analyze', jobId, docId, input }),
      },
      { priority: Priority.MEDIUM },
    );
    return this.await(submission, 'signatures.analyze', (payload) => payload.analysis);
  }

  prepare(input: SignaturePrepareInput): AbortablePromise<SignaturePrepared> {
    const rejected =
      this.gate('doc.sign') ?? (input.certify ? this.gate('doc.sign.certify') : null);
    if (rejected) return rejected;
    const docId = this.docId;
    const submission = this.queue.enqueue<WorkerResultPayload>(
      {
        buildPack: (jobId: JobId) => wirePack({ kind: 'signatures.prepare', jobId, docId, input }),
      },
      { priority: Priority.HIGH },
    );
    return this.await(submission, 'signatures.prepare', (payload) => {
      this.publisher.publishLocal({
        type: 'signatures.prepared',
        signingId: payload.result.signingId,
        field: input.field,
      });
      return payload.result;
    });
  }

  complete(input: SignatureCompleteInput): AbortablePromise<SignatureCompleteResult> {
    const rejected = this.gate('doc.sign');
    if (rejected) return rejected;
    const docId = this.docId;
    const submission = this.queue.enqueue<WorkerResultPayload>(
      {
        buildPack: (jobId: JobId) => wirePack({ kind: 'signatures.complete', jobId, docId, input }),
      },
      { priority: Priority.HIGH },
    );
    return this.await(submission, 'signatures.complete', (payload) => {
      const result = payload.result;
      if (result.status === 'completed') {
        // The session is on new bytes: what its signatures forbid applies
        // from the next call on, and every byte-level fact must be re-read.
        this.guard.setProtection(result.protection);
        this.publisher.publishLocal({
          type: 'signatures.completed',
          signingId: input.signingId,
          ...result,
        });
        this.publisher.publishLocal({ type: 'document.versioned', version: result.version });
      }
      return result;
    });
  }

  cancel(signingId: string): AbortablePromise<SignatureCancelResult> {
    const rejected = this.gate('doc.sign');
    if (rejected) return rejected;
    const docId = this.docId;
    const submission = this.queue.enqueue<WorkerResultPayload>(
      {
        buildPack: (jobId: JobId) =>
          wirePack({ kind: 'signatures.cancel', jobId, docId, signingId }),
      },
      { priority: Priority.HIGH },
    );
    return this.await(submission, 'signatures.cancel', (payload) => {
      if (payload.result.status === 'cancelled') {
        this.publisher.publishLocal({ type: 'signatures.cancelled', signingId });
      }
      return payload.result;
    });
  }

  private gate(
    cap: 'doc.forms.read' | 'doc.download' | 'doc.sign' | 'doc.sign.certify',
  ): AbortablePromise<never> | null {
    if (this.view.isClosed()) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, `document not open: ${this.docId}`),
      );
    }
    try {
      this.guard.assertCapability(cap);
    } catch (err) {
      return AbortablePromise.rejectReason(err);
    }
    return null;
  }

  private await<Tag extends WorkerResultPayload['tag'], R>(
    submission: AbortablePromise<WorkerResultPayload>,
    tag: Tag,
    map: (payload: Extract<WorkerResultPayload, { tag: Tag }>) => R,
  ): AbortablePromise<R> {
    return AbortablePromise.run<R>(async (signal) => {
      const onAbort = () => submission.abort(signal.reason);
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
      const payload = await submission;
      if (payload.tag !== tag) {
        throw new EngineError(EngineErrorCode.WireFormat, `unexpected payload tag: ${payload.tag}`);
      }
      return map(payload as Extract<WorkerResultPayload, { tag: Tag }>);
    });
  }
}
