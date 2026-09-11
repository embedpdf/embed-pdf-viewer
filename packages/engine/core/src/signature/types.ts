import type { FormFieldRef, FormWidgetRef } from '../identity/FormFieldRef';
import type { MutationMeta } from '../mutation/MutationMeta';

/**
 * Digital signatures, read side.
 *
 * Three facts, kept apart on purpose (see the signing plan): a signature
 * is a *bytes* fact (a `/ByteRange` + `/Contents` that seal a byte prefix
 * of the file), cryptography and trust live in `@embedpdf/core-signature`,
 * and what changed after a signature is judged per revision. Everything
 * here is read from the bytes the document was loaded from — for a layer
 * document, the base followed by the delta it was opened with — never
 * from unsaved in-memory edits.
 */

/**
 * Whether the engine enforces what a document's signatures forbid
 * (`protect`, the default: document-derived capabilities are subtracted
 * and locked fields refuse writes) or leaves every edit to the caller
 * (`permit`: for tools whose job is to produce or test invalid files).
 * Analysis never depends on it.
 */
export type SignedDocumentPolicy = 'protect' | 'permit';

/** Hash algorithms the engine can compute over a byte range. SHA-1 is read-only: legacy signatures verify with it, new ones never use it. */
export type DigestAlgorithm = 'sha1' | 'sha256' | 'sha384' | 'sha512';

/** The two `/SubFilter` values the engine can author. Read-side `subFilter` is the raw name and may be anything. */
export type SignatureSubFilter = 'adbe.pkcs7.detached' | 'ETSI.CAdES.detached';

export type SignatureKind = 'signature' | 'timestamp';

/**
 * How the signature's `/ByteRange` relates to the file:
 *   - `whole-revision`: `[0,a) ∪ [b,c)` is exactly one chained revision
 *     and the hole is this signature's own `/Contents`.
 *   - `partial`: well-formed ranges that do not seal a revision.
 *   - `malformed`: unusable ranges or a `/Contents` that is not one DER
 *     object with zero padding.
 */
export type SignatureCoverage = 'whole-revision' | 'partial' | 'malformed';

/** DocMDP / `/Lock /P` permission values (ISO 32000-2 Table 257). */
export type DocMdpPermission = 1 | 2 | 3;

/**
 * The modification level a signed document allows, as a product policy:
 *   - `none`: no byte change at all (not a DocMDP value)
 *   - `lta`: DSS and document timestamps only (P = 1)
 *   - `fill`: + form fill, signatures, new signature fields (P = 2)
 *   - `annotate`: + annotations (P = 3, and the approval baseline)
 */
export type ModificationLevel = 'none' | 'lta' | 'fill' | 'annotate';

export type FieldLockAction = 'all' | 'include' | 'exclude';

/** A FieldMDP transform or a field `/Lock`: which fields it freezes, and an optional `/P` tightening. */
export interface FieldLockSpec {
  action: FieldLockAction;
  /** Fully qualified names; a name covers its descendants (`group` covers `group.total`). Empty for `all`. */
  fields: string[];
  permission?: DocMdpPermission;
}

/**
 * One saved revision of the file: a byte prefix `[0, end)` closed by a
 * cross-reference section reachable from the final `startxref`.
 */
export interface PdfRevision {
  /** 0 = the original document. */
  index: number;
  /** File offset just past the `%%EOF` line ending. */
  end: number;
  /** File offset of the cross-reference section the revision's startxref names. */
  xrefOffset: number;
  /** The signature that seals exactly this revision, when one does. */
  signatureIndex: number | null;
}

/** What the signer claimed in the signature dictionary. None of it is verified here; `/M` in particular is a claim. */
export interface SignatureSigner {
  name: string | null;
  reason: string | null;
  location: string | null;
  contactInfo: string | null;
  /** `/M` as written (PDF date string). */
  claimedTime: string | null;
}

/** The field's `/SV` seed value: what a signature on this field must satisfy. */
export interface SignatureSeedValue {
  /** `/Ff` bits: which of the entries below are requirements rather than suggestions. */
  requiredFlags: number;
  /** Which entries are present at all (same bit layout, plus Cert/MDP/TimeStamp). */
  presentFlags: number;
  /** `/V`: the seed-value parser capability the signer needs (1 = PDF 1.5, 2 = PDF 1.7). */
  version: number | null;
  /** `/MDP /P` when present: 0 = approval signature only. */
  mdp: 0 | 1 | 2 | 3 | null;
  filter: string | null;
  subFilters: string[];
  digestMethods: string[];
  reasons: string[];
  /** A required entry this engine does not implement — signing this field is refused. */
  unsupportedRequired: boolean;
}

export interface SignatureDTO {
  /** Position in `SignatureSnapshot.signatures` (field order). */
  index: number;
  /** Always an `objectNumber` ref: the durable identity. */
  field: FormFieldRef;
  fieldName: string;
  widget: FormWidgetRef | null;
  signed: boolean;
  kind: SignatureKind;
  /** Raw `/Filter` and `/SubFilter` names. */
  filter: string | null;
  subFilter: string | null;
  byteRange: [number, number, number, number] | null;
  /** DER length of `/Contents` as its TLV declares (0 when unsigned or malformed). */
  contentsSize: number;
  /** `null` when unsigned. */
  coverage: SignatureCoverage | null;
  /** Which revision the signature seals; `null` unless coverage is `whole-revision`. */
  revisionIndex: number | null;
  signer: SignatureSigner;
  /** The DocMDP permission the signature carries (its `/Reference`), whether or not the catalog points at it. */
  docMdp: DocMdpPermission | null;
  /** `/Root /Perms /DocMDP` names this signature: it is THE certification. */
  catalogCertification: boolean;
  /** The FieldMDP transform this signature carries. */
  fieldMdp: FieldLockSpec | null;
  /** The field's own `/Lock`. */
  lock: FieldLockSpec | null;
  seedValue: SignatureSeedValue | null;
}

/** A lock an earlier signature established on the current bytes. */
export interface DocumentFieldLock {
  signatureIndex: number;
  source: 'fieldmdp' | 'lock';
  spec: FieldLockSpec;
}

/**
 * Document-derived restrictions in force on the CURRENT bytes: what the
 * signatures already in the file forbid. The engine maps this onto
 * capabilities (a certified document loses page assembly, a P=1 document
 * loses form fill) exactly like encryption permission bits.
 */
export interface DocumentProtection {
  /** `null` when nothing is signed. */
  level: ModificationLevel | null;
  certification: { signatureIndex: number; permission: DocMdpPermission } | null;
  fieldLocks: DocumentFieldLock[];
  /** The versioned product policy that derived this. */
  policyVersion: number;
}

export interface SignatureSnapshot {
  /** `false` when the cross-reference chain is broken or was rebuilt: every byte fact is then indeterminate. */
  chainValid: boolean;
  /** Oldest first. Empty when `chainValid` is false. */
  revisions: PdfRevision[];
  signatures: SignatureDTO[];
  protection: DocumentProtection;
}

/**
 * The saved bytes a session is on. Locally the hash of the loaded bytes
 * (for a layer session: of its base); on the cloud the document's base
 * version. A completed signature always produces a new one.
 */
export interface BaseVersionInfo {
  sha256: string;
  byteLength: number;
}

/**
 * What a signing candidate was built on. Both publish fences are named:
 * the base the candidate extends and how many edits over it it includes
 * (the layer's write serial on the cloud, the session's mutation sequence
 * locally). `complete` must present the same pair.
 */
export interface DocumentVersionRef {
  baseSha256: string;
  editsVersion: number;
}

// ---------------------------------------------------------------------------
// Signing (two-phase). The PDF job is the engine's; the CMS is the caller's.
// ---------------------------------------------------------------------------

/**
 * Widget artwork for the signature, as a page of a PDF (the same path
 * stamps take: the page is drawn into the widget's appearance stream).
 */
export interface SignatureAppearanceInput {
  /** A PDF whose page carries the artwork. */
  pdf: Uint8Array;
  /** Which page; default 0. */
  pageIndex?: number;
}

export interface SignaturePrepareInput {
  field: FormFieldRef;
  kind?: SignatureKind;
  subFilter?: SignatureSubFilter;
  digest?: Exclude<DigestAlgorithm, 'sha1'>;
  /** Room reserved for the CMS, in bytes (256 .. 4 MiB). Default 8192. */
  contentsSize?: number;
  signer?: { name?: string; reason?: string; location?: string; contactInfo?: string };
  /** PDF date string for `/M`; default: now. */
  signingTime?: string;
  /** Make this the certification signature (`/Root /Perms /DocMDP`). Only ever the first signature. */
  certify?: { permission: DocMdpPermission };
  /** FieldMDP for this signature plus a mirroring `/Lock` on the field. */
  lock?: FieldLockSpec;
  appearance?: SignatureAppearanceInput;
}

export interface SignaturePrepared {
  signingId: string;
  digest: Uint8Array;
  algorithm: Exclude<DigestAlgorithm, 'sha1'>;
  byteRange: [number, number, number, number];
  contentsSize: number;
  subFilter: SignatureSubFilter | 'ETSI.RFC3161';
  expectedVersion: DocumentVersionRef;
  /** ISO timestamp after which the candidate is discarded. */
  expiresAt: string | null;
}

export interface SignatureCompleteInput {
  signingId: string;
  /** The detached CMS (PKCS#7 / CAdES SignedData) over the prepared digest. */
  cms: Uint8Array;
  expectedVersion: DocumentVersionRef;
}

export interface SignatureCompleteResult {
  /** `already-completed` on an idempotent replay with the same CMS. */
  status: 'completed' | 'already-completed';
  signature: SignatureDTO;
  /** The version the sealed bytes became. */
  version: BaseVersionInfo;
  /** What it was built on. */
  previous: DocumentVersionRef;
  /** What the document's signatures forbid from now on. */
  protection: DocumentProtection;
  /** Every page is re-pinned: the session moved to new bytes. */
  meta: MutationMeta;
}

export interface SignatureAbortResult {
  status: 'aborted' | 'already-completed' | 'unknown';
}
