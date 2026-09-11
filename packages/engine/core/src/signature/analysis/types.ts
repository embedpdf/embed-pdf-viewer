import type { FormFieldFamily } from '../../forms/field';
import type {
  BaseVersionInfo,
  DocumentFieldLock,
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
 * still listed (their mapping changed): the identical-rewrite rule decides.
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
}

export interface ChangeAnalysis {
  mode: 'authoritative' | 'exploratory';
  policyVersion: number;
  basis: { version: BaseVersionInfo; editsVersion: number; source: 'persisted' | 'working-copy' };
  since: { revisionIndex: number; signatureIndex: number | null };
  until: { revisionIndex: number };
  /** Pairwise, every intervening revision. */
  steps: RevisionAnalysis[];
  /** The worst step. */
  verdict: StepVerdict;
}

/** Everything one pairwise step needs; JSON in, JSON out. */
export interface StepInput {
  older: number;
  newer: number;
  changes: ObjectChange[];
  before: RevisionStructure;
  after: RevisionStructure;
  /** Overrides the level derived from `before` (exploratory mode only). */
  levelOverride?: ModificationLevel;
}
