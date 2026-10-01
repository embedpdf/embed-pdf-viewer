/**
 * @embedpdf/plugin-signature/contract: the public signature vocabulary: the
 * act of signing (one-shot and two-phase), visual fills, validation, the
 * sign-here flow, and the facts about a document's signatures.
 */
import type {
  EventHook,
  EventOrigin,
  OperationOptions,
  ResourceStatus,
  SettingsApi,
} from '@embedpdf/core';
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
 */
export type SignatureMode = 'sign' | 'visual' | 'ask';

/** The key that signs: a signer port, or a function that returns one when someone signs. */
export type SignatureKey = SignerPort | (() => SignerPort | Promise<SignerPort>);

/**
 * The signature plugin's settings. `signaturePlugin(config)` registers them
 * over {@link SIGNATURE_DEFAULTS}, and `updateSettings()` changes them for
 * every document while the app runs. Each is one value: a change replaces a
 * key or a trust port whole.
 */
export interface SignatureSettings {
  /** The key: a raw signer (the CMS is built here) or a CMS signer (a service builds it); `null` for none. */
  readonly key: SignatureKey | null;
  /** What a mark does in a field; `null` is `'sign'` with a key, else `'visual'`. */
  readonly mode: SignatureMode | null;
  /** The certificates you trust, for checking signatures. Without them a verdict is at best `valid-untrusted`. */
  readonly trust: TrustPort | null;
  /** Let a first signature be a certification (still needs `doc.sign.certify`). */
  readonly allowCertify: boolean;
}

/** What the signature settings are when the app registers none. */
export const SIGNATURE_DEFAULTS: SignatureSettings = {
  key: null,
  mode: null,
  trust: null,
  allowCertify: false,
};

/** What `signaturePlugin(config)` takes: any of the settings. */
export type SignatureConfig = Partial<SignatureSettings>;

/** The mark: a stamp-plugin asset, or bytes the embedder brings (PNG, JPEG, or a one-page PDF). */
export type Mark = { assetId: string } | { source: BinarySource };

/** How a signature field is addressed: its field ref, its widget's annotation ref, or the widget's object number. */
export type SignatureFieldAddress = FormFieldRef | AnnotationRef | { objectNumber: number };

export interface SignFieldInput {
  field: FormFieldRef;
  mark: Mark;
  /** A per-call key; the `key` setting otherwise. */
  key?: SignatureKey;
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

/** A signature prepared in two steps and not completed yet. */
export interface SignaturePending {
  readonly signingId: string;
  readonly field: FormFieldRef;
}

/** A signed field's facts, with its verdict from the last check (`null` until one ran). */
export interface SignatureInfo extends SignatureDTO {
  readonly verdict: SignatureVerdict | null;
}

/** What `placeMark` did: sealed, drawn, handed to the chrome (mode `ask`), or placed as a stamp. */
export type PlaceMarkResult =
  | { kind: 'signed'; field: FormFieldRef; result: SignatureCompleteResult }
  | { kind: 'filled'; field: FormFieldRef }
  | { kind: 'requested'; field: FormFieldRef }
  | { kind: 'placed'; annotation: AnnotationRef };

// ── events ──
/** A signing completed, in this session or another: the confirmed `signatures.completed` fact. */
export interface SignatureSignedEvent {
  /** The sealed field, by its durable object-number ref. */
  readonly field: FormFieldRef;
  readonly result: SignatureCompleteResult;
  readonly origin: EventOrigin;
}
/** This session's `fillField()` drew a mark into a field. */
export interface SignatureFilledEvent {
  readonly field: FormFieldRef;
}
/** This session's `clearField()` took a drawn mark out of a field. */
export interface SignatureClearedEvent {
  readonly field: FormFieldRef;
}
export interface SignatureValidatedEvent {
  readonly verdicts: readonly SignatureVerdict[];
}
export interface SignatureProtectionChangedEvent {
  readonly protection: DocumentProtection;
}
/** An unsaved edit just turned a signature that held into one a save would invalidate. Once per edge. */
export interface SignatureInvalidationPredictedEvent {
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

/** Options for `validate()` and `validateField()`. */
export interface SignatureValidateOptions extends OperationOptions {
  /** The moment the certificates are judged at; now by default. */
  readonly at?: ValidationTime;
  /** `'persisted'` checks the file as it was opened; `'working-copy'` (the default) counts unsaved changes. */
  readonly until?: 'persisted' | 'working-copy';
}

/**
 * Signing, visual fills and checking signatures for one document. Every verb
 * rejects with a `PluginError`, and every async verb takes a `signal`. Its
 * settings belong to the plugin, not to a document.
 */
export interface SignatureCapability extends SettingsApi<SignatureSettings> {
  // ── reading ──
  /** Every signature field and its facts, the file's versions and `protection`. The same object until it changes. */
  getSnapshot(): SignatureSnapshot | null;
  /** Whether the signatures are read. */
  getStatus(): ResourceStatus;
  /** The signed fields, in document order, each with its verdict once checked. The same array until one changes. */
  listSignatures(): readonly SignatureInfo[];
  /** Signature fields still to sign, in document order. The same array until one changes. */
  listUnsignedFields(): readonly FormFieldRef[];
  /** One signature field's facts, signed or not, by its ref or its widget's, or `null`. */
  getSignature(field: SignatureFieldAddress): SignatureDTO | null;
  /** Every verdict from the last check; `null` before the first. */
  listVerdicts(): readonly SignatureVerdict[] | null;
  /** One signed field's verdict from the last check, or `null`. */
  getVerdict(field: SignatureFieldAddress): SignatureVerdict | null;
  /** What the document's signatures allow, or `null` before they're read. */
  getProtection(): DocumentProtection | null;
  /** A signature prepared in two steps and not completed: the document can't be changed until it is, or is cancelled. */
  getPending(): SignaturePending | null;
  /** Whether a signing or a fill is running. */
  isBusy(): boolean;
  /** The mode in effect: the `mode` setting, or its default. */
  getMode(): SignatureMode;
  /** The field the next picked mark goes to, or `null`. */
  getTarget(): FormFieldRef | null;

  // ── signing ──
  /**
   * Sign a field: the mark becomes what it shows, the key seals the document,
   * and the signed document is a new version. A signal that fires before the
   * seal leaves nothing signed. Fires `onSigned`. Rejects `permission-denied`
   * without `doc.sign` (or `doc.sign.certify` to certify), `invalid-input`
   * without a key, `not-found`, `operation-cancelled`.
   */
  sign(input: SignFieldInput, options?: OperationOptions): Promise<SignatureCompleteResult>;
  /**
   * Signing in two steps, the first: resolves the digest for your key to sign,
   * and keeps the document from changing until `completeSignature()` or
   * `cancelPending()`. Rejects `permission-denied` without `doc.sign`.
   */
  prepareSignature(
    input: PrepareSignatureInput,
    options?: OperationOptions,
  ): Promise<PreparedSignature>;
  /** Signing in two steps, the second: the key's CMS seals the document. Fires `onSigned`. Rejects `not-found` for a signing this session didn't prepare. */
  completeSignature(
    signingId: string,
    cms: Uint8Array,
    options?: OperationOptions,
  ): Promise<SignatureCompleteResult>;
  /** Give up a signature prepared in two steps, so the document can be changed again. */
  cancelPending(options?: OperationOptions): Promise<void>;
  /**
   * Draw a mark into a field without signing. Fires `onFilled`. Rejects
   * `permission-denied` without `doc.forms.fill`, `conflict` on a signed field.
   */
  fillField(field: FormFieldRef, mark: Mark, options?: OperationOptions): Promise<void>;
  /** Take a drawn mark out of a field. Fires `onCleared`. Rejects like `fillField()`. */
  clearField(field: FormFieldRef, options?: OperationOptions): Promise<void>;
  /**
   * Do what a click with an armed mark does: in a field, sign, fill or ask
   * (`onSignRequested`), by `mode`; anywhere else, place it as a stamp.
   * Rejects like the verb it runs.
   */
  placeMark(
    mark: Mark,
    target: { field: FormFieldRef } | StampPlacement,
    options?: OperationOptions,
  ): Promise<PlaceMarkResult>;
  /** Make a field the target, where the next mark the person picks goes; `null` clears. Fires `onTargetChanged`. */
  setTarget(field: FormFieldRef | null): void;
  /** Ask your UI to show a signed field's details, as clicking it does. Fires `onInspectionRequested`. */
  requestInspection(field: FormFieldRef): void;

  // ── checking ──
  /** Read the signatures again; resolves the snapshot. */
  refresh(options?: OperationOptions): Promise<SignatureSnapshot | null>;
  /**
   * Check every signature again and resolve the verdicts. Unsaved changes
   * count, so the verdict is the one the downloaded file will get;
   * `until: 'persisted'` checks the file as it was opened. Fires `onValidated`.
   */
  validate(options?: SignatureValidateOptions): Promise<readonly SignatureVerdict[]>;
  /** Check one signed field. Rejects `not-found` for an unsigned or unknown field. */
  validateField(
    field: SignatureFieldAddress,
    options?: SignatureValidateOptions,
  ): Promise<SignatureVerdict>;
  /** What changed after a signature or a version of the file, rule by rule. */
  analyzeChanges(input: AnalyzeInput, options?: OperationOptions): Promise<ChangeAnalysis>;
  /**
   * The exact bytes of the file version a signature covers. Rejects
   * `permission-denied` without `doc.download`, `not-found` for an unsigned
   * field.
   */
  readRevision(
    target: SignatureFieldAddress | { revisionIndex: number },
    options?: OperationOptions,
  ): Promise<Uint8Array>;

  // ── permissions ──
  /** Whether signing is allowed: `doc.sign`. A per-call key or two-step signing needs no `key` setting. */
  canSign(): boolean;
  /** Whether drawing a mark into a field without signing is allowed: `doc.forms.fill`. */
  canFill(): boolean;
  /** Whether a certification may be offered: the `allowCertify` setting and `doc.sign.certify`. */
  canCertify(): boolean;
  /** Whether the signed bytes may be read: `doc.download`. */
  canReadRevision(): boolean;

  // ── events ──
  /** A field was signed, whoever signed it; fires once the facts show the sealed field. */
  readonly onSigned: EventHook<SignatureSignedEvent>;
  /** A mark was drawn into a field. */
  readonly onFilled: EventHook<SignatureFilledEvent>;
  /** A drawn mark was taken out of a field. */
  readonly onCleared: EventHook<SignatureClearedEvent>;
  /** The signatures were checked. */
  readonly onValidated: EventHook<SignatureValidatedEvent>;
  /** What the signatures allow changed. */
  readonly onProtectionChanged: EventHook<SignatureProtectionChangedEvent>;
  /** A change would break a signature once saved. */
  readonly onInvalidationPredicted: EventHook<SignatureInvalidationPredictedEvent>;
  /** A field became the target, or the target was cleared. */
  readonly onTargetChanged: EventHook<SignatureTargetChangedEvent>;
  /** In `'ask'` mode, a mark was dropped on a field. */
  readonly onSignRequested: EventHook<SignatureSignRequestedEvent>;
  /** A signed field was clicked. */
  readonly onInspectionRequested: EventHook<SignatureInspectionRequestedEvent>;
}
