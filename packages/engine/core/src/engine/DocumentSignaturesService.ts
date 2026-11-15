import type { FormFieldRef } from '../identity/FormFieldRef';
import type { WriteOptions } from '../mutation/WriteOptions';
import type { AbortablePromise } from '../promise/AbortablePromise';
import type { AnalyzeInput, ChangeAnalysis } from '../signature/analysis/types';
import type {
  DigestAlgorithm,
  SignatureCancelResult,
  SignatureCompleteInput,
  SignatureCompleteResult,
  SignaturePrepareInput,
  SignaturePrepared,
  SignatureSnapshot,
  ValidationInfo,
  ValidationInfoAddResult,
} from '../signature/types';

/**
 * Digital signatures on the document: the read side (what is signed, what
 * it seals, what it forbids) and the two-phase signing protocol. The
 * engine does the PDF job — candidate file, digest, sealing — and never
 * holds a key; the CMS comes from the caller (`@embedpdf/core-signature`
 * builds one from a raw signer, or a signing service returns it).
 *
 * Every read here describes the bytes the document was loaded from
 * (for a layer document: base + the delta it was opened with). Unsaved
 * edits are not part of any revision until `prepare` snapshots them. The
 * one exception is `getValidationInfo`, which reads the document as it is
 * now.
 *
 * Reads ride `doc.forms.read`; `revisionBytes` rides `doc.download`;
 * `prepare`/`complete`/`abort` ride `doc.sign`, a certification
 * additionally `doc.sign.certify`; `addValidationInfo` rides `doc.sign`.
 */
export interface DocumentSignaturesService {
  /** Revisions, every signature field with its signed state, and the protection in force. */
  list(): AbortablePromise<SignatureSnapshot>;

  /** The DER `/Contents` of a signed field (exactly `contentsSize` bytes, padding stripped). `NotFound` for an unsigned field. */
  getContents(field: FormFieldRef): AbortablePromise<Uint8Array>;

  /**
   * Hash the signed field's `/ByteRange` with `algorithm`, straight from
   * the loaded bytes. What a CMS verifier compares its message digest to.
   */
  getDigest(field: FormFieldRef, algorithm: DigestAlgorithm): AbortablePromise<Uint8Array>;

  /** The exact bytes of revision `revisionIndex` (`[0, end)`): what a signature over it signed. */
  downloadRevision(revisionIndex: number): AbortablePromise<Uint8Array>;

  /**
   * What changed after a signature (or after any revision), judged
   * revision by revision against the restrictions in force: every object
   * whose cross-reference mapping moved, with its value and every
   * reference to it in both revisions, and the rule that explains each —
   * or the reference no rule explains. `until: 'working-copy'` snapshots
   * unsaved edits as one more revision first. A truncated value is never
   * permitted; a broken chain is `indeterminate`.
   */
  analyze(input: AnalyzeInput): AbortablePromise<ChangeAnalysis>;

  /**
   * Build the candidate (unsaved edits become their own revision, the
   * signature lands in a fresh update over it), seal it, and return the
   * digest to sign. The live document is untouched and read-only until
   * `complete` or `abort` (`SigningPending`). Refusals are
   * `SignatureRefused` with the reason in the message.
   *
   * A document timestamp (`kind: 'timestamp'`) needs no `field`: the engine
   * makes one for it on the candidate, and `field` of the result names it.
   * That needs `doc.sign`.
   */
  prepare(
    input: SignaturePrepareInput,
    options?: WriteOptions,
  ): AbortablePromise<SignaturePrepared>;

  /**
   * Write the CMS into the candidate and install the sealed bytes as the
   * document's new version. `expectedVersion` must be what `prepare`
   * returned (`SigningVersionMismatch` otherwise). Idempotent: a replay
   * with the same CMS answers `already-completed`. Emits
   * `signatures.completed` and `document.versioned`.
   */
  complete(
    input: SignatureCompleteInput,
    options?: WriteOptions,
  ): AbortablePromise<SignatureCompleteResult>;

  /** Discard a pending candidate. */
  cancel(signingId: string, options?: WriteOptions): AbortablePromise<SignatureCancelResult>;

  /**
   * The validation data the document holds (its security store, `/DSS`):
   * certificates, OCSP responses and CRLs, each entry as it is stored, once.
   * It reads the document as it is now, so entries added and not yet saved
   * are among them. Empty lists when the document has no store.
   */
  getValidationInfo(): AbortablePromise<ValidationInfo>;

  /**
   * Store validation data in the document. An entry the document already
   * holds, byte for byte, is not stored again; `added` counts the ones that
   * were new. Each entry must be one DER object no larger than
   * `VALIDATION_INFO_LIMITS.entryBytes` (`InvalidArg` otherwise, and nothing
   * is stored); what an entry says is not checked.
   *
   * A change like any other write: it is in the file at the next save, as a
   * revision after the signatures, and a signature made after it seals it
   * in. It is not undoable. After a certification that allows no changes it
   * is refused with `ProtectedDocument`. Emits
   * `signatures.validationInfoAdded` when it stored something.
   */
  addValidationInfo(
    input: Partial<ValidationInfo>,
    options?: WriteOptions,
  ): AbortablePromise<ValidationInfoAddResult>;
}
