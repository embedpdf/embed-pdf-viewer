/**
 * @embedpdf/plugin-signature/contract: the public signature vocabulary: the
 * act of signing (one-shot and two-phase), visual fills, validation, the
 * sign-here flow, and the facts about a document's signatures.
 */
import type {
  EventHook,
  EventOrigin,
  OperationOptions,
  PluginError,
  ResourceStatus,
  SettingsApi,
} from '@embedpdf/core';
import type {
  CmsSigner,
  RevocationSource,
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
  FormWidget,
  SignatureCompleteResult,
  Signature,
  SignaturePrepared,
  SignatureSignerInput,
  SignatureSnapshot,
  SignatureSubFilter,
  ValidationInfoCounts,
} from '@embedpdf/engine-core/runtime';
import type { StampPlacement } from '@embedpdf/plugin-annotation/contract';
import type { StampAsset, StampLibrary } from '@embedpdf/plugin-stamp/contract';

export { SignatureToken } from './token';
export type {
  AnalyzeInput,
  ChangeAnalysis,
  DocMdpPermission,
  DocumentProtection,
  FieldLockSpec,
  FormFieldRef,
  SignatureCompleteResult,
  Signature,
  SignaturePrepared,
  SignatureSnapshot,
  ValidationInfoCounts,
} from '@embedpdf/engine-core/runtime';
export type {
  AppliedValidationTime,
  CmsSigner,
  HttpRevocationSourceOptions,
  HttpTimestampAuthorityOptions,
  LongTermGap,
  LongTermGapReason,
  LongTermVerdict,
  RevocationSource,
  RevocationVerdict,
  SignatureVerdict,
  SignerPort,
  TimestampVerdict,
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
export type SigningKey = SignerPort | (() => SignerPort | Promise<SignerPort>);

/**
 * The signature plugin's settings. `signaturePlugin(config)` registers them
 * over {@link SIGNATURE_DEFAULTS}, and `updateSettings()` changes them for
 * every document while the app runs. Each is one value: a change replaces a
 * key, a timestamp authority, a revocation source or a trust port whole.
 */
export interface SignatureSettings {
  /** The key: a raw signer (the CMS is built here) or a CMS signer (a service builds it); `null` for none. */
  readonly signingKey: SigningKey | null;
  /** What a mark does in a field; `null` is `'sign'` with a key, else `'visual'`. */
  readonly mode: SignatureMode | null;
  /**
   * The timestamp authority: every signature this plugin seals then carries a timestamp from
   * it, and a timestamp that can't be had fails the signing. `null` for none.
   */
  readonly timestampAuthority: CmsSigner | null;
  /**
   * Where revocation answers come from. With one, every signature this plugin seals gets its
   * validation data right after: the answers that say its certificates were good at its
   * timestamp, stored in the file, so a reader can check it with no network. Needs `trust`.
   * `null` for none.
   */
  readonly revocation: RevocationSource | null;
  /**
   * Add a document timestamp after the validation data, from `timestampAuthority`: proof that
   * the data was in the file by then.
   */
  readonly documentTimestamp: boolean;
  /**
   * The certificates you trust: for checking signatures, where a verdict without them is at best
   * `valid-untrusted`, and for sealing, where a timestamp from an authority they don't cover is
   * refused.
   */
  readonly trust: TrustPort | null;
  /** Let a first signature be a certification (still needs `doc.sign.certify`). */
  readonly allowCertify: boolean;
}

/** What the signature settings are when the app registers none. */
export const SIGNATURE_DEFAULTS: SignatureSettings = {
  signingKey: null,
  mode: null,
  timestampAuthority: null,
  revocation: null,
  documentTimestamp: false,
  trust: null,
  allowCertify: false,
};

/** What `signaturePlugin(config)` takes: any of the settings. */
export type SignatureConfig = Partial<SignatureSettings>;

/** The mark: a stamp-plugin asset, or bytes the embedder brings (PNG, JPEG, or a one-page PDF). */
export type Mark = { assetId: string } | { source: BinarySource };

/**
 * How a signature field is addressed: its field ref, or its widget, by
 * annotation ref or as a signature names it (`Signature.widget`).
 */
export type SignatureFieldAddress = FormFieldRef | AnnotationRef | FormWidget;

export interface SignFieldInput {
  field: FormFieldRef;
  mark: Mark;
  /** A per-call key; the `key` setting otherwise. */
  signingKey?: SigningKey;
  /** A per-call timestamp authority; `null` signs this one without a timestamp. The setting otherwise. */
  timestampAuthority?: CmsSigner | null;
  /** What the signature dictionary says about the signer; the name defaults to the certificate's subject. */
  signer?: SignatureSignerInput;
  /** Instead of the mark: a ready appearance the embedder composed itself, as a PNG, a JPEG or a one-page PDF. */
  appearance?: BinarySource;
  certify?: { permission: DocMdpPermission };
  lock?: FieldLockSpec;
}

/** Two-phase signing, step one: everything but the key. The digest comes back; a CMS goes in. */
export interface PrepareSignatureInput {
  field: FormFieldRef;
  mark?: Mark;
  /** Instead of the mark: a ready appearance the embedder composed itself, as a PNG, a JPEG or a one-page PDF. */
  appearance?: BinarySource;
  signer?: SignatureSignerInput;
  certify?: { permission: DocMdpPermission };
  lock?: FieldLockSpec;
  subFilter?: SignatureSubFilter;
  digest?: Exclude<DigestAlgorithm, 'sha1'>;
  /** A per-call timestamp authority; `null` seals this one without a timestamp. The setting otherwise. */
  timestampAuthority?: CmsSigner | null;
}

/** The stamp-library kind that holds people's marks: one library per person. */
export const SIGNATURES_LIBRARY_KIND = 'signatures';
/** The asset identifiers inside a signatures library: the full signature and the initials. */
export const SIGNATURE_MARK_NAME = 'signature';
export const INITIALS_MARK_NAME = 'initials';
export type MarkRole = 'signature' | 'initials';
/** Which mark an asset of a signatures library is (anything not named `initials` is a signature). */
export const markRoleOf = (asset: Pick<StampAsset, 'name'>): MarkRole =>
  asset.name === INITIALS_MARK_NAME ? 'initials' : 'signature';

/** One person in a signatures picker: a library of kind `signatures`, with its marks split by role. */
export interface SignerRow {
  readonly libraryId: string;
  readonly name: string;
  readonly library: StampLibrary;
  /** Every full signature of the person, in the library's order. */
  readonly signatures: StampAsset[];
  /** The person's initials, or `null` when the library has none. */
  readonly initials: StampAsset | null;
}

/**
 * The people whose marks the stamp plugin holds, one row per library of kind
 * `signatures`, in the order of `libraries`: give it the stamp plugin's
 * `listLibraries({ kind: SIGNATURES_LIBRARY_KIND })` and `listAssets()`. A
 * pure derivation: rename, delete and export are the stamp plugin's library
 * verbs, and nothing is stored beyond the library's file.
 */
export function signerRowsOf(
  libraries: readonly StampLibrary[],
  assets: readonly StampAsset[],
): SignerRow[] {
  return libraries
    .filter((library) => library.kind === SIGNATURES_LIBRARY_KIND)
    .map((library) => {
      const own = assets.filter((asset) => asset.libraryId === library.id);
      return {
        libraryId: library.id,
        name: library.name,
        library,
        signatures: own.filter((asset) => markRoleOf(asset) === 'signature'),
        initials: own.find((asset) => markRoleOf(asset) === 'initials') ?? null,
      };
    });
}

/** A signature prepared in two steps and not completed yet. */
export interface SignaturePending {
  readonly signingId: string;
  readonly field: FormFieldRef;
}

/** A signature field's facts, with its verdict from the last check (`null` until one ran, or for an unsigned field). */
export interface SignatureInfo extends Signature {
  readonly verdict: SignatureVerdict | null;
}

/** What `addValidationInfo()` put into the file. */
export interface ValidationInfoAdded {
  /** How many entries of each kind were stored: all zero when the file already held them. */
  readonly added: ValidationInfoCounts;
  /** The field of the document timestamp added after them, or `null` when none was added. */
  readonly documentTimestamp: FormFieldRef | null;
}

/**
 * What a sealing resolves: the engine's facts about the signature, and what became of the
 * validation data the `revocation` setting asks for. The signature is sealed either way.
 */
export interface SignFieldResult extends SignatureCompleteResult {
  /**
   * The validation data that followed the seal, as far as it got. `null` when none was to be
   * added (no `revocation` setting, or a session without `doc.sign`), and when none was stored.
   */
  readonly validationInfo: ValidationInfoAdded | null;
  /**
   * Why the validation data, or the document timestamp after it, is not in the file: what
   * `addValidationInfo()` would have rejected with. `null` when nothing failed.
   */
  readonly validationInfoError: PluginError | null;
}

/** What `placeMark` did: sealed, drawn, handed to the chrome (mode `ask`), or placed as a stamp. */
export type PlaceMarkResult =
  | { status: 'signed'; field: FormFieldRef; result: SignFieldResult }
  | { status: 'filled'; field: FormFieldRef }
  | { status: 'requested'; field: FormFieldRef }
  | { status: 'placed'; annotation: AnnotationRef };

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
  /**
   * The moment the certificates are judged at. By default each one is judged at the earliest
   * trusted timestamp that covers what it signed, and now when there is none.
   * `{ kind: 'now' }` judges them all as of now.
   */
  readonly validationTime?: ValidationTime | { readonly kind: 'earliest-timestamp' };
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
  /** One signature field's facts and verdict, signed or not, by its ref or its widget's, or `null`. */
  getSignature(field: SignatureFieldAddress): SignatureInfo | null;
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
   * and the signed document is a new version. With a timestamp authority the
   * signature carries its timestamp, or nothing is signed. A signal that fires
   * before the seal leaves nothing signed. Fires `onSigned`. Rejects
   * `permission-denied` for a field you may not sign (`canSign`), or without
   * `doc.sign.certify` to certify, `invalid-input` without a key, `not-found`,
   * `operation-cancelled`, and `operation-failed` when the key's answer or the
   * timestamp is refused or the authority doesn't answer (`details.authority`).
   *
   * With the `revocation` setting, the signature's validation data is added right after the
   * seal, and a document timestamp with `documentTimestamp`. A failure there can't undo the
   * signature: it still resolves, with the failure in `validationInfoError`.
   */
  sign(input: SignFieldInput, options?: OperationOptions): Promise<SignFieldResult>;
  /**
   * Signing in two steps, the first: resolves the digest for your key to sign,
   * and keeps the document from changing until `completeSignature()` or
   * `cancelPending()`. Rejects like `sign()`.
   */
  prepareSignature(
    input: PrepareSignatureInput,
    options?: OperationOptions,
  ): Promise<SignaturePrepared>;
  /**
   * Signing in two steps, the second: the key's CMS is checked against what
   * was prepared, timestamped when a timestamp authority is set, and seals the
   * document. Fires `onSigned`. When it fails nothing is written and the
   * signing stays prepared: call it again with the same CMS when the authority
   * didn't answer, or `cancelPending()`. Rejects `not-found` for a signing this
   * session didn't prepare, `operation-failed` for a CMS or a timestamp that is
   * refused. Validation data follows the seal as it does for `sign()`.
   */
  completeSignature(
    signingId: string,
    cms: Uint8Array,
    options?: OperationOptions,
  ): Promise<SignFieldResult>;
  /** Give up a signature prepared in two steps, so the document can be changed again. */
  cancelPending(options?: OperationOptions): Promise<void>;
  /**
   * Draw a mark into a field without signing. Fires `onFilled`. Rejects
   * `permission-denied` for a field that isn't yours to sign (`canFill`),
   * `conflict` on a signed field.
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
  /** Read the signatures again. */
  refresh(options?: OperationOptions): Promise<void>;
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
  /**
   * Keep a signed field checkable with no network: ask, through the `revocation` setting,
   * whether its certificates were good at its timestamp, and store the answers in the file.
   * Without `field`, for every signature. With `documentTimestamp`, a document timestamp
   * follows when the answers aren't covered by one yet. All or nothing for the answers: when
   * one is missing, nothing is stored. Rejects `permission-denied` without `doc.sign`,
   * `invalid-input` without the `revocation` and `trust` settings, `not-found` for an unsigned
   * or unknown field, and `operation-failed` when a signature can't be covered
   * (`details.reason`, `details.certificate`, `details.field`), an address didn't answer
   * (`details.source`), or the document timestamp failed (`details.authority`).
   */
  addValidationInfo(
    field?: SignatureFieldAddress,
    options?: OperationOptions,
  ): Promise<ValidationInfoAdded>;
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
  /**
   * Whether signing this field is allowed: `doc.sign`, or a `fields:sign`
   * permission for its group. `false` for a field the form doesn't have. A
   * per-call key or two-step signing needs no `key` setting.
   */
  canSign(field: FormFieldRef): boolean;
  /**
   * Whether drawing a mark into this field without signing is allowed. A
   * mark in a signature field is its signer's to place, so it takes what
   * signing takes: `doc.sign`, or a `fields:sign` permission for its group.
   */
  canFill(field: FormFieldRef): boolean;
  /** Whether a certification may be offered: the `allowCertify` setting and `doc.sign.certify`. */
  canCertify(): boolean;
  /** Whether the signed bytes may be read: `doc.download`. */
  canReadRevision(): boolean;
  /** Whether validation data can be added: the `revocation` and `trust` settings, and `doc.sign`. */
  canAddValidationInfo(): boolean;

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
