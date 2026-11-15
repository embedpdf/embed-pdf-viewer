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
  type SessionEventPublisher,
  type WriteOptions,
  type FormFieldRef,
  type SignatureCancelResult,
  type SignatureCompleteInput,
  type SignatureCompleteResult,
  type SignaturePrepareInput,
  type SignaturePrepared,
  type SignatureSnapshot,
  type ValidationInfo,
  type ValidationInfoAddResult,
} from '@embedpdf/engine-core/runtime';

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
    // The job checks that the handle may sign this field (its group). A timestamp with no
    // field gets one made for it, which takes the right to sign the document itself.
    const rejected =
      this.gate(input.field ? 'sign-some-field' : 'doc.sign') ??
      (input.certify ? this.gate('doc.sign.certify') : null);
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
      // The field that was named, or the one the engine made for a timestamp.
      const field = input.field ?? payload.result.field;
      if (!field) {
        throw new EngineError(EngineErrorCode.Unknown, 'the prepared signing names no field');
      }
      this.publisher.publishWrite(write.opId, {
        type: 'signatures.prepared',
        ...payload.result,
        field,
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

  getValidationInfo(): AbortablePromise<ValidationInfo> {
    const rejected = this.gate('doc.forms.read');
    if (rejected) return rejected;
    const docId = this.docId;
    const submission = this.queue.enqueue<WorkerResultPayload>({
      buildPack: (jobId: JobId) =>
        wirePack({ kind: 'signatures.validationInfo', effect: 'read', jobId, docId }),
    });
    return this.await(submission, 'signatures.validationInfo', (payload) => ({
      certificates: payload.certificates.map((entry) => new Uint8Array(entry)),
      ocspResponses: payload.ocspResponses.map((entry) => new Uint8Array(entry)),
      crls: payload.crls.map((entry) => new Uint8Array(entry)),
    }));
  }

  addValidationInfo(
    input: Partial<ValidationInfo>,
    options?: WriteOptions,
  ): AbortablePromise<ValidationInfoAddResult> {
    const rejected = this.gate('doc.sign');
    if (rejected) return rejected;
    const write = this.opIdFor(options);
    if (write.rejected) return write.rejected;
    let entries: Record<keyof ValidationInfo, ArrayBuffer[]>;
    try {
      entries = {
        certificates: entriesOf(input, 'certificates'),
        ocspResponses: entriesOf(input, 'ocspResponses'),
        crls: entriesOf(input, 'crls'),
      };
    } catch (err) {
      return AbortablePromise.rejectReason(err);
    }
    const docId = this.docId;
    const submission = this.queue.enqueue<WorkerResultPayload>({
      buildPack: (jobId: JobId) =>
        wirePack({
          kind: 'signatures.addValidationInfo',
          effect: 'write',
          jobId,
          opId: write.opId,
          docId,
          ...entries,
        }),
    });
    return this.await(submission, 'signatures.addValidationInfo', (payload) => {
      const result = payload.result;
      if (Object.values(result.added).some((count) => count > 0)) {
        this.publisher.publishWrite(write.opId, {
          type: 'signatures.validationInfoAdded',
          ...result,
        });
      }
      return result;
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
    cap: 'doc.forms.read' | 'doc.download' | 'doc.sign' | 'doc.sign.certify' | 'sign-some-field',
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

/**
 * The entries of one list of `input` as the buffers the worker is sent: a
 * copy of each, so the caller's bytes stay the caller's. `InvalidArg` for a
 * list that is not an array of byte arrays.
 */
function entriesOf(input: Partial<ValidationInfo>, kind: keyof ValidationInfo): ArrayBuffer[] {
  const list = input[kind] ?? [];
  if (!Array.isArray(list) || !list.every((entry) => entry instanceof Uint8Array)) {
    throw new EngineError(EngineErrorCode.InvalidArg, `${kind} must be an array of Uint8Array`, {
      details: { field: kind },
    });
  }
  return list.map((entry) => entry.slice().buffer as ArrayBuffer);
}
