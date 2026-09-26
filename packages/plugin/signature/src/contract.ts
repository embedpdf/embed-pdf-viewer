/**
 * @embedpdf/plugin-signature/contract: the public signature vocabulary: the
 * act of signing (one-shot and two-phase), visual fills, validation, the
 * sign-here flow, and the facts about a document's signatures.
 */
import type { ChangeOrigin, EventHook, OperationOptions, ResourceStatus } from '@embedpdf/core';
import type {
  SignatureVerdict,
  SignerPort,
  TrustPort,
  ValidationTime,
} from '@embedpdf/core-signature';
import type {
  AnalyzeInput,
  AnnotationRef,
  BinarySource,
  ChangeAnalysis,
  DigestAlgorithm,
  DocMdpPermission,
  DocumentProtection,
  FieldLockSpec,
  FormFieldRef,
  SignatureCompleteResult,
  SignatureDTO,
  SignaturePrepared,
  SignatureSignerInput,
  SignatureSnapshot,
  SignatureSubFilter,
} from '@embedpdf/engine-core/runtime';
import type { StampPlacement } from '@embedpdf/plugin-annotation/contract';
import type { StampAsset } from '@embedpdf/plugin-stamp/contract';

export { SignatureToken } from './token';
export type {
  AnalyzeInput,
  ChangeAnalysis,
  DocMdpPermission,
  DocumentProtection,
  FieldLockSpec,
  FormFieldRef,
  SignatureCompleteResult,
  SignatureDTO,
  SignaturePrepared,
  SignatureSnapshot,
} from '@embedpdf/engine-core/runtime';
export type {
  SignatureVerdict,
  SignerPort,
  TrustPort,
  ValidationTime,
} from '@embedpdf/core-signature';

/**
 * What placing a mark on a signature field does:
 *   - `sign`    seal the field with the configured key (the mark is the appearance);
 *   - `visual`  draw the mark into the field without sealing (Preview's "signature");
 *   - `ask`     neither: `onSignRequested` fires so the chrome can open its dialog and decide.
 * Default `sign` when a key is configured, else `visual`.
 */
export type SignatureMode = 'sign' | 'visual' | 'ask';

export interface SignatureConfig {
  mode?: SignatureMode;
  /** The key: a raw signer (the CMS is built here) or a CMS signer (a service builds it). A thunk resolves per signing. */
  key?: SignerPort | (() => Promise<SignerPort>);
  /** Trust anchors for validation. None → every verdict tops out at `valid-untrusted`. */
  trust?: TrustPort;
  /** Let the UI offer a certification (still needs `doc.sign.certify`). Default false. */
  allowCertify?: boolean;
}

/** The mark: a stamp-plugin asset, or bytes the embedder brings (PNG, JPEG, or a one-page PDF). */
export type Mark = { assetId: string } | { source: BinarySource };

/** How a signature field is addressed: its field ref, its widget's annotation ref, or the widget's object number. */
export type SignatureFieldAddress = FormFieldRef | AnnotationRef | { annotObjectNumber: number };

export interface SignFieldInput {
  field: FormFieldRef;
  mark: Mark;
  /** A per-call key; the configured `key` otherwise. */
  key?: SignerPort | (() => Promise<SignerPort>);
  /** What the signature dictionary says about the signer; the name defaults to the certificate's subject. */
  signer?: SignatureSignerInput;
  /** Instead of the mark: a ready one-page appearance PDF the embedder composed itself. */
  appearance?: BinarySource;
  certify?: { permission: DocMdpPermission };
  lock?: FieldLockSpec;
}

/** Two-phase signing, step one: everything but the key. The digest comes back; a CMS goes in. */
export interface PrepareSignatureInput {
  field: FormFieldRef;
  mark?: Mark;
  appearance?: BinarySource;
  signer?: SignatureSignerInput;
  certify?: { permission: DocMdpPermission };
  lock?: FieldLockSpec;
  subFilter?: SignatureSubFilter;
  digest?: Exclude<DigestAlgorithm, 'sha1'>;
}

/** The parked half of a two-phase signing (`prepareSignature` → `completeSignature`). */
export type PreparedSignature = SignaturePrepared;

/** The stamp-library kind that holds people's marks: one library per person. */
export const SIGNATURES_LIBRARY_KIND = 'signatures';
/** The asset identifiers inside a signatures library: the full signature and the initials. */
export const SIGNATURE_MARK_NAME = 'signature';
export const INITIALS_MARK_NAME = 'initials';
export type MarkRole = 'signature' | 'initials';
/** Which mark an asset of a signatures library is (anything not named `initials` is a signature). */
export const markRoleOf = (asset: Pick<StampAsset, 'name'>): MarkRole =>
  asset.name === INITIALS_MARK_NAME ? 'initials' : 'signature';

export interface SignaturePending {
  signingId: string;
  field: FormFieldRef;
}

/** What `placeMark` did: sealed, drawn, handed to the chrome (mode `ask`), or placed as a stamp. */
export type PlaceMarkResult =
  | { kind: 'signed'; field: FormFieldRef; result: SignatureCompleteResult }
  | { kind: 'filled'; field: FormFieldRef }
  | { kind: 'requested'; field: FormFieldRef }
  | { kind: 'placed'; annotation: AnnotationRef };

// ── events ──
/** A signing completed, in this session or another: the confirmed `signature.completed` fact. */
export interface SignatureSignedEvent {
  /** The sealed field, by its durable object-number ref. */
  readonly field: FormFieldRef;
  readonly result: SignatureCompleteResult;
  readonly origin: ChangeOrigin;
}
/** This session's `fillField` or `clearField` finished drawing into a field. */
export interface SignatureFieldEvent {
  readonly field: FormFieldRef;
}
export interface SignatureValidatedEvent {
  readonly verdicts: readonly SignatureVerdict[];
}
export interface SignatureProtectionChangedEvent {
  readonly protection: DocumentProtection;
}
/** An unsaved edit just turned a signature that held into one a save would invalidate. Once per edge. */
export interface SignatureInvalidatingEvent {
  readonly field: FormFieldRef;
  readonly detail: string;
}
export interface SignatureTargetChangedEvent {
  readonly field: FormFieldRef | null;
}
/** Mode `ask`: a mark met a field and the chrome decides (open its dialog, then `sign` / `fillField`). */
export interface SignatureSignRequestedEvent {
  readonly field: FormFieldRef;
  readonly mark: Mark;
}
/** A signed field was activated: show what its signature says. */
export interface SignatureInspectionRequestedEvent {
  readonly field: FormFieldRef;
}

/** Signing, visual fills and validation for one document. Every verb rejects with a `PluginError`. */
export interface SignatureCapability {
  // ── reading ──
  /** Every signature field and its facts. Reference-stable until it changes. */
  getSnapshot(): SignatureSnapshot | null;
  getStatus(): ResourceStatus;
  /** Signed fields, in document order. Reference-stable per snapshot. */
  listSignatures(): readonly SignatureDTO[];
  /** Signature fields still to sign, in document order. Reference-stable per snapshot. */
  listUnsignedFields(): readonly FormFieldRef[];
  /** The signature facts of one field, by ref or by widget, from the last snapshot. */
  getSignature(field: SignatureFieldAddress): SignatureDTO | null;
  /** The last validation (null until one ran). */
  listVerdicts(): readonly SignatureVerdict[] | null;
  /** The verdict of one signed field from the last validation. */
  getVerdict(field: SignatureFieldAddress): SignatureVerdict | null;
  /** What the document's signatures forbid (null when nothing is read yet). */
  getProtection(): DocumentProtection | null;
  /** A parked two-phase signing (here or, on the cloud, elsewhere): the document is read-only. */
  getPending(): SignaturePending | null;
  /** A sign or fill is in flight. */
  isBusy(): boolean;
  /** The effective mode. */
  getMode(): SignatureMode;
  /** The field the next picked mark goes to. */
  getTarget(): FormFieldRef | null;

  // ── the act ──
  /** Seal the field: the mark's page becomes the widget's appearance, the key signs. */
  sign(input: SignFieldInput, options?: OperationOptions): Promise<SignatureCompleteResult>;
  /** Two-phase signing, step one: the digest to sign comes back and the signing is parked. */
  prepareSignature(
    input: PrepareSignatureInput,
    options?: OperationOptions,
  ): Promise<PreparedSignature>;
  /** Two-phase signing, step two: the detached CMS seals the parked signing. */
  completeSignature(
    signingId: string,
    cms: Uint8Array,
    options?: OperationOptions,
  ): Promise<SignatureCompleteResult>;
  /** Cancel the parked signing, if any. */
  cancelPending(options?: OperationOptions): Promise<void>;
  /** Visual only: the mark becomes the widget's appearance; nothing is sealed. Rejects `conflict` on a signed field. */
  fillField(field: FormFieldRef, mark: Mark, options?: OperationOptions): Promise<void>;
  /** Undo a visual fill (a blank appearance). Rejects `conflict` on a signed field. */
  clearField(field: FormFieldRef, options?: OperationOptions): Promise<void>;
  /** The destination rule in one call: a field (sign, fill, or ask by mode) or a free placement (a stamp). */
  placeMark(
    mark: Mark,
    target: { field: FormFieldRef } | StampPlacement,
    options?: OperationOptions,
  ): Promise<PlaceMarkResult>;
  /** Name the field the next picked mark goes to (the chrome's "Sign here"); null clears. */
  setTarget(field: FormFieldRef | null): void;
  /** Ask the host UI to show a signed field's facts. */
  requestInspection(field: FormFieldRef): void;

  // ── judging ──
  refresh(options?: OperationOptions): Promise<SignatureSnapshot | null>;
  /**
   * Judge every signature. The viewer's default is the working copy: unsaved
   * edits count, so the verdict is the one the file a save produces will get.
   * `until: 'persisted'` judges the loaded bytes only.
   */
  validate(
    options?: { at?: ValidationTime; until?: 'persisted' | 'working-copy' } & OperationOptions,
  ): Promise<readonly SignatureVerdict[]>;
  /** Judge one signed field. Rejects `not-found` for an unsigned or unknown field. */
  validateField(
    field: SignatureFieldAddress,
    options?: { at?: ValidationTime; until?: 'persisted' | 'working-copy' } & OperationOptions,
  ): Promise<SignatureVerdict>;
  /** What changed after a signature. */
  analyzeChanges(input: AnalyzeInput, options?: OperationOptions): Promise<ChangeAnalysis>;
  /** The exact bytes a signature's revision covers — rides `doc.download`. */
  readRevision(
    target: SignatureFieldAddress | { revisionIndex: number },
    options?: OperationOptions,
  ): Promise<Uint8Array>;

  // ── twins ──
  /** `doc.sign` is granted and a key is configured (or resolvable). */
  canSign(): boolean;
  /** Visual fills ride `doc.forms.fill`. */
  canFill(): boolean;
  /** `allowCertify` and `doc.sign.certify`. */
  canCertify(): boolean;

  // ── events ──
  /** A signing completed, whoever sealed it; fires once the facts show the sealed field. */
  readonly onSigned: EventHook<SignatureSignedEvent>;
  readonly onFilled: EventHook<SignatureFieldEvent>;
  readonly onCleared: EventHook<SignatureFieldEvent>;
  readonly onValidated: EventHook<SignatureValidatedEvent>;
  readonly onProtectionChanged: EventHook<SignatureProtectionChangedEvent>;
  readonly onInvalidating: EventHook<SignatureInvalidatingEvent>;
  readonly onTargetChanged: EventHook<SignatureTargetChangedEvent>;
  readonly onSignRequested: EventHook<SignatureSignRequestedEvent>;
  readonly onInspectionRequested: EventHook<SignatureInspectionRequestedEvent>;
}
