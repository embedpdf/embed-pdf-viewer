import {
  AbortablePromise,
  EngineError,
  EngineErrorCode,
  opIdOf,
  wirePack,
  type AnalyzeInput,
  type ChangeAnalysis,
  type DigestAlgorithm,
  type DocumentSignaturesService,
  type WriteOptions,
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
import type { JobId, WorkerResultPayload } from '../worker/protocol';
import type { JobQueue } from '../worker/WorkerQueue';

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
    private readonly queue: JobQueue,
    private readonly view: DocClosedView,
    private readonly guard: ScopeGuard,
    private readonly publisher: SessionEventPublisher,
  ) {}

  list(): AbortablePromise<SignatureSnapshot> {
    const rejected = this.gate('doc.forms.read');
    if (rejected) return rejected;
    const docId = this.docId;
    const submission = this.queue.enqueue<WorkerResultPayload>({
      buildPack: (jobId: JobId) =>
        wirePack({ kind: 'signatures.list', effect: 'read', jobId, docId }),
    });
    return this.await(submission, 'signatures.list', (payload) => payload.snapshot);
  }

  getContents(field: FormFieldRef): AbortablePromise<Uint8Array> {
    const rejected = this.gate('doc.forms.read');
    if (rejected) return rejected;
    const docId = this.docId;
    const submission = this.queue.enqueue<WorkerResultPayload>({
      buildPack: (jobId: JobId) =>
        wirePack({ kind: 'signatures.contents', effect: 'read', jobId, docId, ref: field }),
    });
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
    const submission = this.queue.enqueue<WorkerResultPayload>({
      buildPack: (jobId: JobId) =>
        wirePack({
          kind: 'signatures.digest',
          effect: 'read',
          jobId,
          docId,
          ref: field,
          algorithm,
        }),
    });
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
    const submission = this.queue.enqueue<WorkerResultPayload>({
      buildPack: (jobId: JobId) =>
        wirePack({ kind: 'signatures.revisionBytes', effect: 'read', jobId, docId, revisionIndex }),
    });
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
    const submission = this.queue.enqueue<WorkerResultPayload>({
      buildPack: (jobId: JobId) =>
        wirePack({ kind: 'signatures.analyze', effect: 'read', jobId, docId, input }),
    });
    return this.await(submission, 'signatures.analyze', (payload) => payload.analysis);
  }

  prepare(
    input: SignaturePrepareInput,
    options?: WriteOptions,
  ): AbortablePromise<SignaturePrepared> {
    // The job checks that the handle may sign this field (its group).
    const rejected =
      this.gate('sign-some-field') ?? (input.certify ? this.gate('doc.sign.certify') : null);
    if (rejected) return rejected;
    const write = this.opIdFor(options);
    if (write.rejected) return write.rejected;
    const docId = this.docId;
    const authority = this.guard.changeAuthority();
    const submission = this.queue.enqueue<WorkerResultPayload>({
      buildPack: (jobId: JobId) =>
        wirePack({
          kind: 'signatures.prepare',
          effect: 'snapshot',
          jobId,
          docId,
          input,
          authority,
        }),
    });
    return this.await(submission, 'signatures.prepare', (payload) => {
      this.publisher.publishWrite(write.opId, {
        type: 'signatures.prepared',
        field: input.field,
        ...payload.result,
      });
      return payload.result;
    });
  }

  complete(
    input: SignatureCompleteInput,
    options?: WriteOptions,
  ): AbortablePromise<SignatureCompleteResult> {
    const rejected = this.gate('sign-some-field');
    if (rejected) return rejected;
    const write = this.opIdFor(options);
    if (write.rejected) return write.rejected;
    const docId = this.docId;
    const authority = this.guard.changeAuthority();
    const submission = this.queue.enqueue<WorkerResultPayload>({
      buildPack: (jobId: JobId) =>
        wirePack({
          kind: 'signatures.complete',
          effect: 'contentWrite',
          jobId,
          opId: write.opId,
          docId,
          input,
          authority,
        }),
    });
    return this.await(submission, 'signatures.complete', (payload) => {
      const result = payload.result;
      if (result.status === 'completed') {
        // The session is on new bytes: what its signatures forbid applies
        // from the next call on, and every byte-level fact must be re-read.
        this.guard.setProtection(result.protection);
        this.publisher.publishWrite(
          write.opId,
          { type: 'signatures.completed', signingId: input.signingId, ...result },
          { type: 'document.versioned', version: result.version },
        );
      }
      return result;
    });
  }

  cancel(signingId: string, options?: WriteOptions): AbortablePromise<SignatureCancelResult> {
    const rejected = this.gate('sign-some-field');
    if (rejected) return rejected;
    const write = this.opIdFor(options);
    if (write.rejected) return write.rejected;
    const docId = this.docId;
    const submission = this.queue.enqueue<WorkerResultPayload>({
      buildPack: (jobId: JobId) =>
        wirePack({ kind: 'signatures.cancel', effect: 'session', jobId, docId, signingId }),
    });
    return this.await(submission, 'signatures.cancel', (payload) => {
      if (payload.result.status === 'cancelled') {
        this.publisher.publishWrite(write.opId, { type: 'signatures.cancelled', signingId });
      }
      return payload.result;
    });
  }

  /** The write's `opId` (the caller's, else a fresh one), or the refusal of an invalid one. */
  private opIdFor(
    options: WriteOptions | undefined,
  ): { opId: string; rejected?: never } | { rejected: AbortablePromise<never> } {
    try {
      return { opId: opIdOf(options) };
    } catch (err) {
      return { rejected: AbortablePromise.rejectReason(err) };
    }
  }

  /**
   * The checks before a call: the document is open and the handle may `cap`.
   * `sign-some-field`: the handle may sign some signature field (`doc.sign`,
   * or a `fields:sign` scope); the job checks the field it signs.
   */
  private gate(
    cap: 'doc.forms.read' | 'doc.download' | 'doc.sign.certify' | 'sign-some-field',
  ): AbortablePromise<never> | null {
    if (this.view.isClosed()) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, `document not open: ${this.docId}`),
      );
    }
    try {
      if (cap === 'sign-some-field') this.guard.assertSomeFieldWrite('sign');
      else this.guard.assertCapability(cap);
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
