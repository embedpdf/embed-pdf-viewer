import type { FormFieldFamily } from '../../forms/field';
import type {
  BaseVersionInfo,
  DocMdpPermission,
  DocumentFieldLock,
  FieldLockSpec,
  ModificationLevel,
  SignatureDTO,
} from '../types';

/**
 * The shallow serialisation of a PDF object as the fork's revision diff
 * emits it, parsed. A stream carries its length and SHA-256 rather than
 * its data; every nested value is direct (references stay references).
 */
export type PdfValue =
  | { t: 'dict'; entries: Record<string, PdfValue> }
  | { t: 'array'; items: PdfValue[] }
  | { t: 'ref'; num: number }
  | { t: 'name'; v: string }
  | { t: 'string'; v: string }
  | { t: 'number'; v: number }
  | { t: 'bool'; v: boolean }
  | { t: 'null' }
  | { t: 'stream'; length: number; sha256: string; dict: Record<string, PdfValue> };

/**
 * One inbound reference: the referring object (0 = the trailer) and the
 * label leading to the reference inside it. Edges are *anchored*: a
 * reference from an unchanged, non-structural object is resolved through
 * that object to the nearest changed or structural ancestor, and `via`
 * lists the objects it was resolved through, from the anchor's side down
 * to the object. A widget's appearance stream reached through an unchanged
 * indirect `/AP` dictionary is therefore
 * `{ parent: widget, label: 'AP/N', via: [apDict] }`.
 */
export interface ObjectReferrer {
  parent: number;
  /** Escaped dictionary keys and `[n]` indexes joined by `/`, e.g. `AcroForm/Fields/[0]`, `AP/N`. */
  label: string;
  via?: number[];
}

export type ObjectChangeType = 'added' | 'modified' | 'freed';

/**
 * What reading the object from one revision's bytes came to. `failed` is a
 * live mapping whose bytes do not parse (or a stream whose data cannot be
 * read): the side is present and its value is not evidence - two failed
 * reads are never "the same value".
 */
export type ObjectReadStatus = 'ok' | 'failed' | 'absent';

/**
 * Facts about one revision as a whole that decide whether later changes to
 * it can be judged at all. Acrobat treats a document with a sparse
 * cross-reference table (object numbers below /Size with no entry of any
 * kind) or a reachable bare-reference object (an indirect object whose
 * whole body is a reference) as corrupted the moment any revision follows
 * the signed one; a verdict on such a base would disagree with it.
 */
export interface RevisionHealth {
  sparseXref: boolean;
  bareReferences: number;
  /** False when the reachability walk hit its budget: usage on that side is a lower bound. */
  referrersComplete: boolean;
}
export type ObjectChangeKind =
  | 'dictionary'
  | 'stream'
  | 'array'
  | 'scalar'
  | 'xref'
  | 'objstm'
  | 'trailer';

/**
 * One object whose cross-reference mapping differs between two revisions,
 * with its value in both and every object that references it in both.
 * The trailer is object number 0. Objects that serialise identically are
 * still listed (their mapping changed): the identical-rewrite rule judges them.
 */
export interface ObjectChange {
  objectNumber: number;
  change: ObjectChangeType;
  kind: ObjectChangeKind;
  /**
   * Whether the object exists on each side. Derived from `change` by the
   * transport (`added` → no old side, `freed` → no new side); the trailer
   * exists on both sides and carries no generation numbers.
   */
  present: { old: boolean; new: boolean };
  generation: { old: number | null; new: number | null };
  /**
   * The values, or null where the side is absent. A present side with a
   * null value is *missing evidence*: the evaluator treats it as truncated.
   */
  value: { old: PdfValue | null; new: PdfValue | null; truncated: boolean };
  /** The serialisation as emitted, for exact comparison. */
  raw: { old: string | null; new: string | null };
  /** Per-side read status; absent on older transports (then `ok` for present sides). */
  read?: { old: ObjectReadStatus; new: ObjectReadStatus };
  streamDataChanged: boolean;
  /** Anchored inbound edges per side (see `ObjectReferrer`). */
  usage: { old: ObjectReferrer[]; new: ObjectReferrer[] };
  /**
   * Set when the transport could not resolve every edge within its budget
   * (depth, fan-out, total reads). Treated like a truncated value: the step
   * is indeterminate, never permitted.
   */
  usageIncomplete?: boolean;
}

export interface RevisionField {
  objectNumber: number;
  /** Fully qualified name. */
  name: string;
  family: FormFieldFamily;
  /** Widget annotation object numbers (a merged field-widget lists its own number). */
  widgets: number[];
  /**
   * The effective `/Ff` (inherited through the field tree), as the form
   * model sees it. A lock landing on a field writes `effective | ReadOnly`
   * into the terminal dictionary, so judging that write needs the effective
   * flags, not the terminal's own (possibly absent) entry.
   */
  flags?: number;
}

/**
 * What one revision looks like structurally: enough to give every object
 * a role (the catalog, a page, a field, a widget, a signature value)
 * without walking paths from the root.
 */
export interface RevisionStructure {
  root: number;
  acroForm: number;
  pagesRoot: number;
  pages: number[];
  fields: RevisionField[];
  signatures: SignatureDTO[];
}

export interface ChangeFinding {
  rule: string;
  verdict: 'permitted' | 'forbidden' | 'incomplete';
  objectNumber: number;
  /** The specific edge (`parent:label`) this finding vouches for or condemns, when it is about one. */
  edge?: string;
  detail?: string;
}

export type StepVerdict = 'unchanged' | 'permitted' | 'forbidden' | 'indeterminate';

export interface RevisionAnalysis {
  older: number;
  newer: number;
  /** The level in force after the restrictions established up to `older`. */
  levelInForce: ModificationLevel;
  /** Locks in force for this step (from the signatures in `older`). */
  locks: DocumentFieldLock[];
  verdict: StepVerdict;
  findings: ChangeFinding[];
  changes: ObjectChange[];
}

/**
 * A restriction in force for the judged window: a DocMDP certification or a
 * FieldMDP/lock, and whose it is. A FieldMDP lock is a promise the locking
 * signature makes about its own window and binds no other signature's
 * verdict (corpus v3/85); a certification's level is inherited by every
 * later window as well (conservative until observed otherwise).
 */
export interface RestrictionAnchor {
  signatureIndex: number;
  revisionIndex: number;
  source: 'docmdp' | 'fieldmdp' | 'lock';
  /** Declared by the signature being judged, as opposed to inherited. */
  own: boolean;
  permission?: DocMdpPermission;
  fields?: FieldLockSpec;
}

/** One judgement with its evidence status; `complete: false` never coexists with a passing verdict. */
export interface Assessment {
  verdict: StepVerdict;
  complete: boolean;
  /** The finding that decided a forbidden or indeterminate verdict, or the most notable permitted one. */
  primary?: ChangeFinding;
  findings: ChangeFinding[];
}

export interface AnalyzeInput {
  /** Start from the revision a signature seals, or from any revision. */
  since: { signatureIndex: number } | { revisionIndex: number };
  /**
   * `persisted` (default): the loaded bytes. `working-copy`: the session's
   * unsaved state, snapshotted the way a save would write it, as one more
   * revision. A revision index compares against history only.
   */
  until?: 'persisted' | 'working-copy' | { revisionIndex: number };
  /**
   * Exploratory only: evaluate as if this level were in force. The result
   * is tagged `mode: 'exploratory'` and never becomes a verdict.
   */
  exploratoryLevel?: ModificationLevel;
  /**
   * `summary` (default): the verdict and its findings. `full`: also every
   * pairwise step between `since` and `until`, with each step's changes
   * (large; for diagnostics and tooling).
   */
  detail?: 'summary' | 'full';
}

/**
 * How the judged revision stands against the revision the signature
 * sealed. The verdict is the net state - `until` compared with `since`
 * directly - the way Acrobat judges an approval signature (a page changed
 * and byte-restored later is unchanged; corpus v2/15, 42, 44, v3/81, 85).
 * A certification window replays every intervening revision as well
 * (v3/82-83), and any step's violation joins the verdict.
 */
export interface ChangeAnalysis {
  mode: 'authoritative' | 'exploratory';
  policyVersion: number;
  basis: { version: BaseVersionInfo; editsVersion: number; source: 'persisted' | 'working-copy' };
  since: { revisionIndex: number; signatureIndex: number | null };
  until: { revisionIndex: number };
  /** The restrictions this window was judged under (see `RestrictionAnchor`). */
  restrictions: RestrictionAnchor[];
  /** The verdict, with the findings behind it. */
  current: Assessment & { method: 'net-state' | 'net-state+replay' };
  /** Facts about the revisions between `since` and `until`; never a verdict. */
  later: {
    revisionCount: number;
    /** Objects rewritten after `since` that hold the sealed value again in `until`. */
    undoneObjectNumbers: number[];
  };
  /** Equals `current.verdict`: one field for every consumer that only needs the answer. */
  verdict: StepVerdict;
  /**
   * The pairwise steps: the single step when one revision follows `since`,
   * every step of a certification replay, or every step with
   * `detail: 'full'`. Empty otherwise (a multi-revision approval window in
   * summary mode is judged on its net state alone).
   */
  steps: RevisionAnalysis[];
}

/** Everything one pairwise step needs; JSON in, JSON out. */
export interface StepInput {
  older: number;
  newer: number;
  changes: ObjectChange[];
  before: RevisionStructure;
  after: RevisionStructure;
  /** What the transport learned about each revision as a whole (see `RevisionHealth`). */
  health?: { old: RevisionHealth; new: RevisionHealth };
  /**
   * The restrictions to judge under. Absent: derived from every signature
   * in `before` (a revision-anchored analysis). Present: the judged
   * signature's own locks and the inherited certification level.
   */
  restrictions?: { level: ModificationLevel; locks: DocumentFieldLock[] };
  /** Overrides the level derived from `before` (exploratory mode only). */
  levelOverride?: ModificationLevel;
}
