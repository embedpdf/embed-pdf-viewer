import { createCapabilityToken, type EventHook } from '@embedpdf/core';
import type {
  SignatureVerdict,
  SignerPort,
  TrustPort,
  ValidationTime,
} from '@embedpdf/core-signature';
import type {
  AnalyzeInput,
  BinarySource,
  ChangeAnalysis,
  DocMdpPermission,
  DocumentProtection,
  FieldLockSpec,
  FormFieldRef,
  SignatureCompleteResult,
  SignatureDTO,
  SignatureSnapshot,
} from '@embedpdf/engine-core/runtime';
import type { StampPlacement } from '@embedpdf/plugin-annotation/contract';
import type { StampAsset } from '@embedpdf/plugin-stamp/contract';

/**
 * What placing a mark on a signature field does:
 *   - `sign`    seal the field with the configured signer (the mark is the appearance);
 *   - `visual`  draw the mark into the field without sealing (Preview's "signature");
 *   - `ask`     neither — emit `ask` so the chrome can open its dialog and decide.
 * Default `sign` when a signer is configured, else `visual`.
 */
export type SignatureMode = 'sign' | 'visual' | 'ask';

export interface SignatureConfig {
  mode?: SignatureMode;
  /** The key holder: a raw signer (the CMS is built here) or a CMS signer (a service builds it). A thunk resolves per signing. */
  signer?: SignerPort | (() => Promise<SignerPort>);
  /** Trust anchors for validation. None → every verdict tops out at `valid-untrusted`. */
  trust?: TrustPort;
  /** Let the UI offer a certification (still needs `doc.sign.certify`). Default false. */
  allowCertify?: boolean;
}

/** The mark: a stamp-plugin asset, or bytes the embedder brings (PNG, JPEG, or a one-page PDF). */
export type Mark = { assetId: string } | { source: BinarySource };

export interface SignFieldInput {
  field: FormFieldRef;
  mark: Mark;
  /** What the signature dictionary says (`/Name` `/Reason` `/Location` `/ContactInfo`); the name defaults to the certificate's subject. */
  attribution?: { name?: string; reason?: string; location?: string; contactInfo?: string };
  /** Instead of the mark: a ready one-page appearance PDF the embedder composed itself. */
  appearance?: BinarySource;
  certify?: { permission: DocMdpPermission };
  lock?: FieldLockSpec;
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

export interface SignaturePending {
  signingId: string;
  field: FormFieldRef;
}

export interface SignatureState {
  snapshot: SignatureSnapshot | null;
  verdicts: SignatureVerdict[] | null;
  /** The field the user chose to sign next ("select the field, then pick a mark"). */
  target: FormFieldRef | null;
  /** A signing candidate is parked (here or, on the cloud, elsewhere): the document is read-only. */
  pending: SignaturePending | null;
  /** A sign/fill call is in flight. */
  busy: boolean;
}

export type SignatureAction =
  | { type: 'SNAPSHOT'; snapshot: SignatureSnapshot | null }
  | { type: 'VERDICTS'; verdicts: SignatureVerdict[] | null }
  | { type: 'TARGET'; field: FormFieldRef | null }
  | { type: 'PENDING'; pending: SignaturePending | null }
  | { type: 'BUSY'; busy: boolean };

export type SignatureChange =
  | { type: 'signed'; field: FormFieldRef; result: SignatureCompleteResult }
  | { type: 'filled'; field: FormFieldRef }
  | { type: 'cleared'; field: FormFieldRef }
  /** Mode `ask`: a mark met a field and the chrome decides (open its dialog, then `signField`/`fillField`). */
  | { type: 'ask'; field: FormFieldRef; mark: Mark }
  /** A signed field was activated: show what its signature says. */
  | { type: 'inspect'; field: FormFieldRef }
  | { type: 'target'; field: FormFieldRef | null }
  | { type: 'validated'; verdicts: SignatureVerdict[] }
  /** An unsaved edit just turned a signature that held into one a save would invalidate. Once per edge. */
  | { type: 'invalidating'; field: FormFieldRef; detail: string }
  | { type: 'protectionChanged'; protection: DocumentProtection };

export interface SignatureCapability {
  // ── selectors ──
  snapshot(): SignatureSnapshot | null;
  verdicts(): SignatureVerdict[] | null;
  protection(): DocumentProtection | null;
  pending(): SignaturePending | null;
  target(): FormFieldRef | null;
  busy(): boolean;
  mode(): SignatureMode;
  /** The signature facts of one field, by ref or by widget, from the last snapshot. */
  signatureOf(field: FormFieldRef | { annotObjectNumber: number }): SignatureDTO | null;
  /** The verdict of one signed field from the last validation. */
  verdictOf(field: FormFieldRef | { annotObjectNumber: number }): SignatureVerdict | null;
  /** `doc.sign` is granted and a signer is configured (or resolvable). */
  canSign(): boolean;
  /** Visual fills ride `doc.forms.fill`. */
  canFill(): boolean;
  /** `allowCertify` and `doc.sign.certify`. */
  canCertify(): boolean;
  // ── the act ──
  /** Seal the field: the mark's page becomes the widget's appearance, the configured signer signs. */
  signField(input: SignFieldInput): Promise<SignatureCompleteResult>;
  /** Visual only: the mark becomes the widget's appearance; nothing is sealed. Refused on a signed field. */
  fillField(field: FormFieldRef, mark: Mark): Promise<void>;
  /** Undo a visual fill (a blank appearance). Refused on a signed field. */
  clearField(field: FormFieldRef): Promise<void>;
  /** The destination rule in one call: a field (sign, fill, or ask by mode) or a free placement (a stamp). */
  placeMark(mark: Mark, target: { field: FormFieldRef } | StampPlacement): Promise<void>;
  /** Name the field the next picked mark goes to (the chrome's "Sign here"); null clears. */
  setTarget(field: FormFieldRef | null): void;
  /** Ask the chrome to show a signed field's facts (`inspect`). */
  inspect(field: FormFieldRef): void;
  // ── reading ──
  refresh(): Promise<SignatureSnapshot | null>;
  /**
   * Judge every signature. The viewer's default is the WORKING COPY: unsaved
   * edits count, so the verdict is the one the file a save produces will get.
   * `until: 'persisted'` judges the loaded bytes only.
   */
  validate(opts?: {
    at?: ValidationTime;
    until?: 'persisted' | 'working-copy';
  }): Promise<SignatureVerdict[]>;
  analyze(input: AnalyzeInput): Promise<ChangeAnalysis>;
  /** The exact bytes a signature's revision covers (`doc.signatures.revisionBytes`) — rides `doc.download`. */
  revisionBytes(revisionIndex: number): Promise<Uint8Array>;
  onChanged: EventHook<SignatureChange>;
}

export const SignatureToken = createCapabilityToken<SignatureCapability>('signature');
