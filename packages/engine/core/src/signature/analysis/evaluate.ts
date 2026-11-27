import type { DocumentFieldLock, ModificationLevel } from '../types';
import type { PdfValue } from './types';
import { conclude } from './verdict';
import { deriveProtection, levelAllows, lockCovers } from '../protection';
import { changedKeys, dictEntries, pdfValueEquals, refsOf } from './pdf-value';
import type {
  ChangeFinding,
  ObjectChange,
  ObjectReferrer,
  RevisionAnalysis,
  RevisionField,
  RevisionStructure,
  StepInput,
  StepVerdict,
  UnwrittenObject,
} from './types';

type Side = 'old' | 'new';
const SIDES: Side[] = ['old', 'new'];

const TRAILER_KEYS = new Set([
  'Size',
  'Prev',
  'XRefStm',
  'Info',
  'ID',
  'Root',
  'Type',
  'W',
  'Index',
  'Filter',
  'DecodeParms',
  'Length',
  'Encrypt',
]);
const CATALOG_KEYS = new Set(['Metadata', 'Extensions', 'Version', 'DSS', 'AcroForm', 'Perms']);
const ACROFORM_KEYS = new Set(['DR', 'DA', 'Q', 'SigFlags', 'NeedAppearances', 'Fields']);
/**
 * What a form field may change after a signature, by the level in force.
 * Every key here has a corpus case behind it (`signature-compat`); a key
 * not listed is forbidden until one does.
 *
 *   annotate (an approval signature: "Form Fill-in, Signing and Commenting
 *   are allowed"): everything but the field's identity and its place in
 *   the tree. v1/08 /V+/AP, 09 /Ff, 10 /Rect, 11 /F, 18 /TU, 21 /DA; 13 /T
 *   forbidden. /AA (v1/12) and /A are accepted by Acrobat and deliberately
 *   not listed: an action on a signed form is executable content.
 *
 *   fill (a P=2 certification): value and appearance. v1/26 /V+/AP, v3/64
 *   /Ff (ReadOnly added), 65 /DA, 68 /AP stream; v3/66 /TU, 67 /F, v2/50
 *   /Rect forbidden.
 */
const FIELD_KEYS_BY_LEVEL: Record<'annotate' | 'fill', ReadonlySet<string>> = {
  annotate: new Set([
    'V',
    'AS',
    'AP',
    'I',
    'DA',
    'Ff',
    'RV',
    'MK',
    'Q',
    'TU',
    'F',
    'Rect',
    'BS',
    'Opt',
    'DV',
    'MaxLen',
  ]),
  fill: new Set(['V', 'AS', 'AP', 'I', 'RV', 'DA', 'Ff']),
};
/** A separate widget dictionary: the presentation subset of the same tables. */
const WIDGET_KEYS_BY_LEVEL: Record<'annotate' | 'fill', ReadonlySet<string>> = {
  annotate: new Set(['AS', 'AP', 'DA', 'MK', 'Q', 'TU', 'F', 'Rect', 'BS']),
  fill: new Set(['AS', 'AP', 'DA']),
};
/**
 * Signing an existing field: its value, appearance and ReadOnly at any
 * level; after an approval signature also its tooltip and a /Lock installed
 * with the signature (v1/18, 19: both valid; under P=2 the combination is
 * rejected, v3/69, so neither is allowed at `fill`).
 */
const SIGNED_FIELD_KEYS_BY_LEVEL: Record<'annotate' | 'fill', ReadonlySet<string>> = {
  annotate: new Set(['V', 'AP', 'AS', 'Ff', 'TU', 'Lock']),
  fill: new Set(['V', 'AP', 'AS', 'Ff']),
};
const SIGNED_WIDGET_KEYS = new Set(['AP', 'AS']);
const FF_READ_ONLY = 1;

function fieldKeysFor(level: ModificationLevel): ReadonlySet<string> {
  return level === 'annotate' ? FIELD_KEYS_BY_LEVEL.annotate : FIELD_KEYS_BY_LEVEL.fill;
}
function widgetKeysFor(level: ModificationLevel): ReadonlySet<string> {
  return level === 'annotate' ? WIDGET_KEYS_BY_LEVEL.annotate : WIDGET_KEYS_BY_LEVEL.fill;
}
function signedFieldKeysFor(level: ModificationLevel): ReadonlySet<string> {
  return level === 'annotate'
    ? SIGNED_FIELD_KEYS_BY_LEVEL.annotate
    : SIGNED_FIELD_KEYS_BY_LEVEL.fill;
}

/**
 * Rules whose permitted findings do not make a revision a change of the
 * document: an object written again with the sealed value, an object nobody
 * references, a cross-reference container, the trailer's own bookkeeping.
 * A window with nothing else is `unchanged` (Acrobat: "not modified").
 */
const NON_EFFECTIVE_RULES = new Set(['identical-rewrite', 'orphan', 'xref-container', 'trailer']);

/** The level a step runs at, and the locks it enforces: what the older revision's signatures established. */
export function restrictionsOf(before: RevisionStructure): {
  level: ModificationLevel;
  locks: DocumentFieldLock[];
} {
  const protection = deriveProtection(before.signatures);
  // The judged level: what a validator holds this step to. Nothing signed
  // yet: nothing forbids, the rule set explains what it can.
  return { level: protection.judged ?? 'annotate', locks: protection.fieldLocks };
}

/**
 * The objects the rules read that `changes` does not hold, for the transport
 * to read from the revisions' bytes and hand over as `StepInput.unwritten`.
 *
 * One kind so far: the annotation list of a page this step wrote, when the
 * list is an object of its own that the step left alone. Acrobat adds a
 * signature field to such a page by pointing it at a new list object, so
 * what the page listed before is in no object the revision wrote (fixture
 * `signature-long-term/acrobat-lta+acrobat-timestamp.pdf`).
 */
export function unwrittenObjectsToRead(
  input: Pick<StepInput, 'changes' | 'before' | 'after'>,
): number[] {
  const pages = new Set([...input.before.pages, ...input.after.pages]);
  const written = new Set(input.changes.map((c) => c.objectNumber));
  const out = new Set<number>();
  for (const c of input.changes) {
    if (!pages.has(c.objectNumber)) continue;
    for (const side of SIDES) {
      const list = dictEntries(c.value[side])?.Annots;
      if (list?.t === 'ref' && !written.has(list.num)) out.add(list.num);
    }
  }
  return [...out].sort((a, b) => a - b);
}

/**
 * Judge one pairwise step. Every reference to a changed object, in the
 * older and the newer revision, must be claimed by a rule that inspected
 * that use; an unclaimed reference is `unexplained` and forbidden. A
 * truncated value is `incomplete`, never permitted. Pure: JSON in, JSON
 * out, the same code in the browser worker, on the server and in tests.
 */
export function evaluateStep(input: StepInput): RevisionAnalysis {
  const changes = withEvidenceCheck(input.changes);
  const { level, locks } = input.restrictions ?? restrictionsOf(input.before);
  const levelInForce = input.levelOverride ?? level;
  const ctx = new StepContext({ ...input, changes }, levelInForce, locks);

  ruleRevisionHealth(ctx);
  ruleXrefContainer(ctx);
  ruleIdenticalRewrite(ctx);
  if (ctx.allows('fill')) {
    // Locks first: a frozen object is condemned before any rule could vouch for it.
    ruleFieldLock(ctx);
    ruleTrailer(ctx);
    ruleInfo(ctx);
    ruleMetadata(ctx);
    ruleCatalog(ctx);
    ruleAcroForm(ctx);
    ruleDss(ctx);
    ruleSignatureFieldAdded(ctx);
    ruleSignatureAdded(ctx);
    ruleUnsignedSignatureAppearance(ctx);
    ruleFormFill(ctx);
    ruleAnnotation(ctx);
  } else {
    ruleTrailer(ctx);
    ruleNoChangesCertification(ctx);
  }
  ruleUnexplained(ctx);

  const verdict: StepVerdict = conclude(
    ctx.findings,
    ctx.findings.some((f) => f.verdict === 'permitted' && !NON_EFFECTIVE_RULES.has(f.rule)),
  );

  return {
    older: input.older,
    newer: input.newer,
    levelInForce,
    locks,
    verdict,
    findings: ctx.findings,
    changes,
  };
}

/**
 * The evaluator never trusts its transport to be honest about gaps: a side
 * that exists must carry a value, and an object whose value is missing is
 * judged as truncated, whatever the flag says. Cross-reference containers
 * are exempt (their members are judged on their own).
 */
function withEvidenceCheck(changes: ObjectChange[]): ObjectChange[] {
  return changes.map((c) => {
    if (c.value.truncated || c.kind === 'xref' || c.kind === 'objstm') return c;
    const missingOld = c.present.old && (c.value.old === null || c.read?.old === 'failed');
    const missingNew = c.present.new && (c.value.new === null || c.read?.new === 'failed');
    return missingOld || missingNew ? { ...c, value: { ...c.value, truncated: true } } : c;
  });
}

/**
 * The transport's verdict on each revision as a whole. A sealed revision
 * Acrobat cannot judge later changes to (sparse cross-reference table, a
 * reachable bare-reference object) makes every step over it indeterminate:
 * our verdict would otherwise disagree with the validator recipients use,
 * and for a reason that has nothing to do with the change. An incomplete
 * reachability walk on either side leaves every use unproven.
 */
function ruleRevisionHealth(ctx: StepContext): void {
  const health = ctx.input.health;
  if (!health) return;
  const base = health.old;
  if (base.sparseXref || base.bareReferences > 0) {
    const why = [
      base.sparseXref
        ? 'its cross-reference table has no entry for some object numbers below /Size'
        : null,
      base.bareReferences > 0
        ? `${base.bareReferences} reachable indirect object(s) consist of a bare reference`
        : null,
    ]
      .filter((x) => x !== null)
      .join('; ');
    ctx.findings.push({
      rule: 'base-unverifiable',
      verdict: 'incomplete',
      objectNumber: 0,
      detail: `the signed revision cannot be verified against later changes by Acrobat (${why}); no verdict is given rather than one Acrobat would contradict`,
    });
  }
  for (const side of SIDES) {
    if (!health[side].referrersComplete) {
      ctx.findings.push({
        rule: 'unexplained',
        verdict: 'incomplete',
        objectNumber: 0,
        detail: `the ${side === 'old' ? 'older' : 'newer'} revision's reachability walk hit its budget; not every use of a changed object is known`,
      });
    }
  }
}

/**
 * Same effective value on both sides: same canonical serialisation (keys
 * sorted, whitespace normalised - Acrobat compares dictionaries by value,
 * corpus v3/61-62), same stream data (by bytes, v2/45), and both sides
 * actually read. A failed read serialises as "null" and would match another
 * failed read - evidence of nothing.
 */
export function sameEffectiveValue(c: ObjectChange): boolean {
  return (
    c.change === 'modified' &&
    !c.value.truncated &&
    c.read?.old !== 'failed' &&
    c.read?.new !== 'failed' &&
    c.raw.old !== null &&
    c.raw.new !== null &&
    c.raw.old === c.raw.new &&
    !c.streamDataChanged
  );
}

// ---------------------------------------------------------------------------

interface RoleIndex {
  fieldByObj: Map<number, RevisionField>;
  widgetToField: Map<number, number>;
  pages: Set<number>;
  signedFields: Set<number>;
  sigFields: Set<number>;
}

function indexRoles(s: RevisionStructure): RoleIndex {
  const fieldByObj = new Map<number, RevisionField>();
  const widgetToField = new Map<number, number>();
  const sigFields = new Set<number>();
  for (const f of s.fields) {
    fieldByObj.set(f.objectNumber, f);
    if (f.kind === 'signature') sigFields.add(f.objectNumber);
    for (const w of f.widgets) widgetToField.set(w, f.objectNumber);
  }
  const signedFields = new Set<number>();
  for (const sig of s.signatures) {
    if (sig.signed && sig.field.kind === 'objectNumber') signedFields.add(sig.field.objectNumber);
  }
  return { fieldByObj, widgetToField, pages: new Set(s.pages), signedFields, sigFields };
}

function edgeKey(e: ObjectReferrer): string {
  return `${e.parent}:${e.label}`;
}

class StepContext {
  readonly findings: ChangeFinding[] = [];
  readonly byNum = new Map<number, ObjectChange>();
  /** The objects the step left alone that the transport read for the rules. */
  readonly unwritten = new Map<number, UnwrittenObject>();
  readonly before: RoleIndex;
  readonly after: RoleIndex;
  /**
   * `${objectNumber}:${side}:${edge}` → the rule that inspected the use, and
   * whether it allowed it. A claim explains an edge in the report; only an
   * allowing claim can vouch for a shared object joining a subtree.
   */
  private readonly claims = new Map<string, { rule: string; allow: boolean }>();
  /** Objects a lock forbids touching this step. */
  readonly locked = new Set<number>();

  constructor(
    readonly input: StepInput,
    readonly level: ModificationLevel,
    readonly locks: DocumentFieldLock[],
  ) {
    for (const c of input.changes) this.byNum.set(c.objectNumber, c);
    for (const kept of input.unwritten ?? []) {
      // A step's own object is read from the step, never from here.
      if (!this.byNum.has(kept.objectNumber)) this.unwritten.set(kept.objectNumber, kept);
    }
    this.before = indexRoles(input.before);
    this.after = indexRoles(input.after);
  }

  get changes(): ObjectChange[] {
    return this.input.changes;
  }

  allows(needed: ModificationLevel): boolean {
    return levelAllows(this.level, needed);
  }

  claimEdge(c: ObjectChange, side: Side, edge: ObjectReferrer, rule: string, allow = true): void {
    if (this.locked.has(c.objectNumber)) return;
    const key = `${c.objectNumber}:${side}:${edgeKey(edge)}`;
    if (!this.claims.has(key)) this.claims.set(key, { rule, allow });
  }

  claimAll(c: ObjectChange, rule: string, allow = true): void {
    for (const side of SIDES)
      for (const e of c.usage[side]) this.claimEdge(c, side, e, rule, allow);
  }

  /**
   * Claim the references that are the same in both revisions; a reference
   * gained or lost stays unexplained. `allow: false` explains a condemned
   * object's edges (one cause in the report, not a cascade) without letting
   * anything hang off it.
   */
  claimStable(c: ObjectChange, rule: string, allow = true): void {
    const oldKeys = new Set(c.usage.old.map(edgeKey));
    const newKeys = new Set(c.usage.new.map(edgeKey));
    for (const e of c.usage.old)
      if (newKeys.has(edgeKey(e))) this.claimEdge(c, 'old', e, rule, allow);
    for (const e of c.usage.new)
      if (oldKeys.has(edgeKey(e))) this.claimEdge(c, 'new', e, rule, allow);
  }

  isClaimed(c: ObjectChange, side: Side, edge: ObjectReferrer): boolean {
    return this.claims.has(`${c.objectNumber}:${side}:${edgeKey(edge)}`);
  }

  /** The use was inspected by a rule that allowed it. */
  isAllowed(c: ObjectChange, side: Side, edge: ObjectReferrer): boolean {
    return this.claims.get(`${c.objectNumber}:${side}:${edgeKey(edge)}`)?.allow === true;
  }

  permitted(c: ObjectChange, rule: string, detail?: string): void {
    if (this.locked.has(c.objectNumber)) return;
    this.findings.push({ rule, verdict: 'permitted', objectNumber: c.objectNumber, detail });
  }

  /**
   * A violation is only proven on evidence: a rule condemning an object
   * whose value could not be read or inspected is reporting what it could
   * not see, and that is `incomplete`, never `forbidden`.
   */
  forbidden(c: ObjectChange, rule: string, detail: string, edge?: ObjectReferrer): void {
    this.findings.push({
      rule,
      verdict: c.value.truncated ? 'incomplete' : 'forbidden',
      objectNumber: c.objectNumber,
      edge: edge ? edgeKey(edge) : undefined,
      detail: c.value.truncated ? `${detail} (judged on missing evidence: not proven)` : detail,
    });
  }

  /**
   * Claim every reference under a set of parents (an appearance subtree,
   * the DSS): objects whose references come from `parents` through labels
   * `accept`, then everything referenced from those objects, and so on.
   * Runs per side, because a replaced appearance stream exists on one
   * side only. `admit` narrows which changed objects may join.
   */
  claimSubtree(
    side: Side,
    roots: Set<number>,
    accept: (label: string, parent: number) => boolean,
    rule: string,
    admit: (c: ObjectChange) => boolean = () => true,
  ): void {
    // Two sets, never merged: an edge from a root is inside the subtree
    // only through an accepted label, on every pass; an edge from an object
    // that joined is inside through any label. Folding the roots into the
    // frontier would let one accepted child (an appearance stream, a DSS
    // update) vouch for every other edge off the same parent.
    const joined = new Set<number>();
    let grew = true;
    while (grew) {
      grew = false;
      for (const c of this.changes) {
        if (roots.has(c.objectNumber) || joined.has(c.objectNumber)) continue;
        // An object the rule doesn't admit stays out, and so does what hangs off it.
        if (this.locked.has(c.objectNumber) || !admit(c)) continue;
        const edges = c.usage[side];
        if (edges.length === 0) continue;
        const inside = edges.filter(
          (e) => (roots.has(e.parent) && accept(e.label, e.parent)) || joined.has(e.parent),
        );
        if (inside.length === 0) continue;
        for (const e of inside) this.claimEdge(c, side, e, rule);
        // A changed object joins the subtree - and brings its own children
        // in - only when every use of it is allowed: by this subtree, or by
        // another rule that permitted the owner (a font shared between a
        // filled field's appearance and /AcroForm /DR, corpus v1/16, 21). A
        // use nobody allowed - a signed page's content (v1/30, v2/39, 52),
        // a locked field's appearance (v3/79) - keeps the object, and
        // everything under it, unexplained.
        if (edges.every((e) => inside.includes(e) || this.isAllowed(c, side, e))) {
          joined.add(c.objectNumber);
          grew = true;
        }
      }
    }
  }

  isIdentical(c: ObjectChange): boolean {
    return sameEffectiveValue(c);
  }

  /** Signatures signed in the newer revision but not the older: this step's signing events. */
  newlySigned(): Array<{
    fieldObjectNumber: number;
    sig: RevisionStructure['signatures'][number];
  }> {
    const out: Array<{ fieldObjectNumber: number; sig: RevisionStructure['signatures'][number] }> =
      [];
    for (const sig of this.input.after.signatures) {
      if (!sig.signed || sig.field.kind !== 'objectNumber') continue;
      if (this.before.signedFields.has(sig.field.objectNumber)) continue;
      out.push({ fieldObjectNumber: sig.field.objectNumber, sig });
    }
    return out;
  }
}

// ---------------------------------------------------------------------------
// Rules. Each claims the exact references it inspected and records a finding.
// ---------------------------------------------------------------------------

function ruleXrefContainer(ctx: StepContext): void {
  for (const c of ctx.changes) {
    if (c.kind === 'xref' || c.kind === 'objstm') {
      ctx.claimAll(c, 'xref-container');
      ctx.permitted(
        c,
        'xref-container',
        'cross-reference container; members are judged on their own',
      );
    }
  }
}

/**
 * An object written again with the value the sealed revision holds is not
 * a modification: Acrobat compares objects by value and reports such a
 * revision as "not modified" for every role tried - document information,
 * a custom catalog entry, a page, the signed signature's own widget, a text
 * field, an annotation, the encryption dictionary, reserialised with keys
 * reordered, under a certification, under a field lock (corpus v1/02-07,
 * 23, v2/47, v3/54-62, 70, 71, 77). Under P=1 nothing is established and
 * the rewrite stays forbidden. Claimed here so the object-kind rules skip
 * it; the verdict treats it as no effective change.
 */
function ruleIdenticalRewrite(ctx: StepContext): void {
  for (const c of ctx.changes) {
    if (!ctx.isIdentical(c)) continue;
    if (ctx.allows('fill')) {
      ctx.claimAll(c, 'identical-rewrite');
      ctx.permitted(c, 'identical-rewrite', 'written again with the sealed value');
    } else {
      ctx.claimAll(c, 'identical-rewrite', false);
      ctx.forbidden(
        c,
        'identical-rewrite',
        `written again with the sealed value under level '${ctx.level}' (not established for this level)`,
      );
    }
  }
}

/**
 * After a certification that allows no changes, nothing may follow. ISO
 * 32000-2 lets validation data and document timestamps through, and pyHanko
 * follows it. Acrobat does not: it reports the certification as altered for
 * validation data alone, for a document information dictionary alone and for
 * a document timestamp alone, in a PDF 1.7 file and in a PDF 2.0 file
 * (fixtures `signature-long-term`). Acrobat is the validator recipients use,
 * so every object such a revision writes is forbidden. The trailer and the
 * cross-reference containers are the revision's own bookkeeping, and an
 * object written again unchanged is judged by its own rule.
 */
function ruleNoChangesCertification(ctx: StepContext): void {
  const rule = 'no-changes-certification';
  for (const c of ctx.changes) {
    if (c.objectNumber === 0 || c.kind === 'xref' || c.kind === 'objstm') continue;
    if (ctx.isIdentical(c)) continue;
    ctx.claimAll(c, rule, false);
    ctx.forbidden(
      c,
      rule,
      `${c.change} after a certification that allows no changes: Acrobat reports the certification as altered (ISO 32000-2 allows validation data and document timestamps here, Acrobat does not)`,
    );
  }
}

function ruleTrailer(ctx: StepContext): void {
  const c = ctx.byNum.get(0);
  if (!c) return;
  const changed = changedKeys(c.value.old, c.value.new);
  const bad = [...changed].filter((k) => !TRAILER_KEYS.has(k));
  const oldRoot = dictEntries(c.value.old)?.Root;
  const newRoot = dictEntries(c.value.new)?.Root;
  if (bad.length > 0) {
    ctx.forbidden(c, 'trailer', `trailer keys changed: ${bad.join(', ')}`);
    return;
  }
  if (changed.has('Root') && !pdfValueEquals(oldRoot ?? null, newRoot ?? null)) {
    ctx.forbidden(c, 'trailer', 'the trailer points at a different catalog');
    return;
  }
  if (
    changed.has('Encrypt') &&
    !pdfValueEquals(
      dictEntries(c.value.old)?.Encrypt ?? null,
      dictEntries(c.value.new)?.Encrypt ?? null,
    )
  ) {
    ctx.forbidden(c, 'trailer', 'the trailer points at a different encryption dictionary');
    return;
  }
  ctx.claimAll(c, 'trailer');
  ctx.permitted(c, 'trailer');
}

function onlyEdges(c: ObjectChange, test: (e: ObjectReferrer) => boolean): boolean {
  const all = [...c.usage.old, ...c.usage.new];
  return all.length > 0 && all.every(test);
}

function ruleInfo(ctx: StepContext): void {
  for (const c of ctx.changes) {
    if (ctx.isIdentical(c)) continue;
    if (c.objectNumber !== 0 && onlyEdges(c, (e) => e.parent === 0 && e.label === 'Info')) {
      ctx.claimAll(c, 'info');
      ctx.permitted(c, 'info', 'document information dictionary');
    }
  }
}

function ruleMetadata(ctx: StepContext): void {
  const roots = new Set([ctx.input.before.root, ctx.input.after.root]);
  for (const c of ctx.changes) {
    if (ctx.isIdentical(c)) continue;
    if (onlyEdges(c, (e) => roots.has(e.parent) && e.label === 'Metadata')) {
      ctx.claimAll(c, 'metadata');
      ctx.permitted(c, 'metadata', 'XMP metadata stream');
    }
  }
}

function ruleCatalog(ctx: StepContext): void {
  const root = ctx.input.after.root;
  const c = ctx.byNum.get(root);
  if (!c || ctx.isIdentical(c)) return;
  const changed = changedKeys(c.value.old, c.value.new);
  const bad = [...changed].filter((k) => !CATALOG_KEYS.has(k));
  if (bad.length > 0) {
    ctx.forbidden(c, 'catalog-housekeeping', `catalog keys changed: ${bad.join(', ')}`);
    return;
  }
  // A direct /AcroForm dictionary changes with the catalog: judge it by the
  // AcroForm rules, and let its default resources ride the catalog's edges.
  if (changed.has('AcroForm') && !ctx.input.after.acroForm && !ctx.input.before.acroForm) {
    const problem = acroFormProblem(
      ctx,
      dictEntries(c.value.old)?.AcroForm ?? null,
      dictEntries(c.value.new)?.AcroForm ?? null,
    );
    if (problem) {
      ctx.forbidden(c, 'acroform-housekeeping', problem);
      return;
    }
    for (const side of SIDES) {
      ctx.claimSubtree(
        side,
        new Set([root]),
        (label) => label.startsWith('AcroForm/DR/'),
        'acroform-housekeeping',
      );
    }
  }
  if (changed.has('Perms')) {
    const after = deriveProtection(ctx.input.after.signatures);
    const before = deriveProtection(ctx.input.before.signatures);
    if (!after.certification || before.judged !== null) {
      ctx.forbidden(
        c,
        'catalog-housekeeping',
        '/Perms may only appear with the certification signature, in the first signed revision',
      );
      return;
    }
  }
  ctx.claimAll(c, 'catalog-housekeeping');
  ctx.permitted(c, 'catalog-housekeeping');
}

function ruleAcroForm(ctx: StepContext): void {
  const acro = ctx.input.after.acroForm || ctx.input.before.acroForm;
  if (!acro) return;
  const c = ctx.byNum.get(acro);
  if (!c || ctx.isIdentical(c)) return;
  const problem = acroFormProblem(ctx, c.value.old, c.value.new);
  if (problem) {
    ctx.forbidden(c, 'acroform-housekeeping', problem);
    return;
  }
  ctx.claimAll(c, 'acroform-housekeeping');
  ctx.permitted(c, 'acroform-housekeeping');
  // Default resources (fonts for appearances) live under /DR.
  for (const side of SIDES) {
    ctx.claimSubtree(
      side,
      new Set([acro]),
      (label) => label.startsWith('DR/'),
      'acroform-housekeeping',
    );
  }
}

/** What is wrong with an AcroForm dictionary change, or null when it is housekeeping. */
function acroFormProblem(
  ctx: StepContext,
  oldValue: PdfValue | null,
  newValue: PdfValue | null,
): string | null {
  const changed = changedKeys(oldValue, newValue);
  const bad = [...changed].filter((k) => !ACROFORM_KEYS.has(k));
  if (bad.length > 0) return `AcroForm keys changed: ${bad.join(', ')}`;
  if (changed.has('Fields')) {
    const oldRefs = refsOf(dictEntries(oldValue)?.Fields);
    const newRefs = refsOf(dictEntries(newValue)?.Fields);
    if (oldRefs.length > newRefs.length || oldRefs.some((n, i) => newRefs[i] !== n)) {
      return '/AcroForm /Fields is not append-only';
    }
    const newSigFields = newSignatureFields(ctx);
    const strangers = newRefs.slice(oldRefs.length).filter((n) => !newSigFields.has(n));
    if (strangers.length > 0)
      return `/AcroForm /Fields gained non-signature fields: ${strangers.join(', ')}`;
  }
  return null;
}

/** The refs appended to an array-valued key when the old array is a prefix of the new one; null otherwise. */
function appendedRefs(c: ObjectChange, key: string): number[] | null {
  const oldItems = dictEntries(c.value.old)?.[key];
  const newItems = dictEntries(c.value.new)?.[key];
  const oldRefs = refsOf(oldItems);
  const newRefs = refsOf(newItems);
  if (oldItems && oldItems.t !== 'array') return null;
  if (!newItems || newItems.t !== 'array') return null;
  if (oldRefs.length > newRefs.length) return null;
  for (let i = 0; i < oldRefs.length; i++) if (oldRefs[i] !== newRefs[i]) return null;
  return newRefs.slice(oldRefs.length);
}

/**
 * The array objects of this step that are one page's /Annots and nothing
 * else, with their page. Acrobat keeps a page's annotation list this way,
 * as an object of its own, and every entry a reference.
 */
function annotsHolders(ctx: StepContext): Map<number, number> {
  const pages = new Set([...ctx.before.pages, ...ctx.after.pages]);
  const out = new Map<number, number>();
  for (const c of ctx.changes) {
    if (c.kind !== 'array' || c.value.truncated) continue;
    const uses = [...c.usage.old, ...c.usage.new];
    // Every use is one page's /Annots: nothing else points at the array.
    if (uses.length === 0 || !uses.every((e) => pages.has(e.parent) && e.label === 'Annots')) {
      continue;
    }
    const owners = new Set(uses.map((e) => e.parent));
    if (owners.size !== 1) continue;
    const onlyReferences = [c.value.old, c.value.new].every(
      (value) =>
        value === null || (value.t === 'array' && refsOf(value).length === value.items.length),
    );
    if (onlyReferences) out.set(c.objectNumber, uses[0].parent);
  }
  return out;
}

/** A page's annotation list on one side of a step, and where it is kept. */
interface PageList {
  refs: number[];
  /** The object that holds the list when it is one of its own; 0 when the array is inside the page. */
  object: number;
  /** That object's change, when this step wrote it. */
  holder: ObjectChange | null;
}

/**
 * Read a page's annotation list on one side: from the page when the array
 * is inside it; from the list's own object when this step wrote that
 * object; and from the revision's bytes (`StepInput.unwritten`) when the
 * step left that object alone. Null when it cannot be read: the transport
 * handed over no such object, or it holds something other than a list of
 * references.
 */
function pageList(
  ctx: StepContext,
  holders: ReadonlyMap<number, number>,
  page: ObjectChange,
  side: Side,
): PageList | null {
  const value = dictEntries(page.value[side])?.Annots;
  if (!value) return { refs: [], object: 0, holder: null };
  if (value.t === 'array') return { refs: refsOf(value), object: 0, holder: null };
  if (value.t !== 'ref') return null;
  const holder = ctx.byNum.get(value.num);
  if (!holder) {
    const kept = ctx.unwritten.get(value.num);
    if (!kept || kept.read !== 'ok' || kept.value?.t !== 'array') return null;
    const refs = refsOf(kept.value);
    if (refs.length !== kept.value.items.length) return null;
    return { refs, object: value.num, holder: null };
  }
  if (holders.get(holder.objectNumber) !== page.objectNumber) return null;
  const list = holder.value[side];
  return list ? { refs: refsOf(list), object: holder.objectNumber, holder } : null;
}

/** What `after` has beyond `before`, when `before` is its beginning; null otherwise. */
function appendedTo(before: number[], after: number[]): number[] | null {
  if (before.length > after.length) return null;
  for (let i = 0; i < before.length; i++) if (before[i] !== after[i]) return null;
  return after.slice(before.length);
}

function newSignatureFields(ctx: StepContext): Set<number> {
  const out = new Set<number>();
  for (const n of ctx.after.sigFields) if (!ctx.before.fieldByObj.has(n)) out.add(n);
  return out;
}

function ruleDss(ctx: StepContext): void {
  const roots = new Set([ctx.input.before.root, ctx.input.after.root]);
  for (const side of SIDES) {
    ctx.claimSubtree(side, roots, (label) => label === 'DSS' || label.startsWith('DSS/'), 'dss');
  }
  for (const c of ctx.changes) {
    if (
      c.usage.new.some((e) => roots.has(e.parent) && e.label === 'DSS') &&
      !ctx.findings.some((f) => f.objectNumber === c.objectNumber)
    ) {
      ctx.permitted(c, 'dss', 'document security store');
    }
  }
}

function ruleSignatureFieldAdded(ctx: StepContext): void {
  const added = newSignatureFields(ctx);
  if (added.size === 0) return;
  const rule = 'signature-field-added';
  if (!ctx.allows('fill')) {
    for (const n of added) {
      const c = ctx.byNum.get(n);
      if (c) ctx.forbidden(c, rule, `a signature field was added under level '${ctx.level}'`);
    }
    return;
  }
  const newWidgets = new Set<number>();
  for (const n of added) {
    const field = ctx.after.fieldByObj.get(n)!;
    const c = ctx.byNum.get(n);
    if (c) {
      ctx.claimAll(c, rule);
      ctx.permitted(c, rule, `new signature field "${field.name}"`);
    }
    for (const w of field.widgets) {
      newWidgets.add(w);
      if (w === n) continue;
      const wc = ctx.byNum.get(w);
      if (wc) {
        ctx.claimAll(wc, rule);
        ctx.permitted(wc, rule, `widget of new signature field "${field.name}"`);
      }
    }
  }
  // The page that lists the new widget: /Annots append-only. The list is an
  // array inside the page, or an object of its own (Acrobat's way); when the
  // field is added it may stay where it is, move from one to the other
  // (fixture `signature-long-term/acrobat-lta.pdf`), or move to a new list
  // object while the old one stays in the file unwritten
  // (`signature-long-term/acrobat-lta+acrobat-timestamp.pdf`).
  const holders = annotsHolders(ctx);
  for (const p of ctx.after.pages) {
    const c = ctx.byNum.get(p);
    if (!c || ctx.isIdentical(c)) continue;
    const changed = changedKeys(c.value.old, c.value.new);
    if (changed.size !== 1 || !changed.has('Annots')) continue;
    const before = pageList(ctx, holders, c, 'old');
    const after = pageList(ctx, holders, c, 'new');
    if (!before || !after) continue;
    const appended = appendedTo(before.refs, after.refs);
    if (!appended || !appended.every((n) => newWidgets.has(n))) continue;
    // A list that moved to another object must also have grown: a move alone
    // is not something a new field explains.
    const moved = before.object !== after.object;
    if (moved && appended.length === 0) continue;
    ctx.claimAll(c, rule);
    ctx.permitted(c, rule, 'page /Annots gained the new signature widget');
    const replaced = before.object !== 0 && after.object !== 0;
    for (const holder of new Set([before.holder, after.holder])) {
      if (!holder) continue;
      ctx.claimAll(holder, rule);
      ctx.permitted(
        holder,
        rule,
        replaced
          ? 'page /Annots moved to another list object, with the new signature widget'
          : 'page /Annots moved into an object of its own, with the new signature widget',
      );
    }
  }
  // A list that already is an object of its own, and grows there: the page
  // itself is not written (fixtures `signature-long-term/grow-acrobat-lta+*`).
  for (const number of holders.keys()) {
    const c = ctx.byNum.get(number)!;
    if (c.change !== 'modified' || ctx.isIdentical(c)) continue;
    const appended = appendedTo(refsOf(c.value.old), refsOf(c.value.new));
    if (appended && appended.length > 0 && appended.every((n) => newWidgets.has(n))) {
      ctx.claimAll(c, rule);
      ctx.permitted(c, rule, 'page /Annots, an object of its own, gained the new signature widget');
    }
  }
  // A parent field whose /Kids gained the new field.
  for (const c of ctx.changes) {
    if (c.kind !== 'dictionary' || ctx.isIdentical(c)) continue;
    const changed = changedKeys(c.value.old, c.value.new);
    if (changed.size !== 1 || !changed.has('Kids')) continue;
    const appended = appendedRefs(c, 'Kids');
    if (
      appended &&
      appended.length > 0 &&
      appended.every((n) => added.has(n) || newWidgets.has(n))
    ) {
      ctx.claimAll(c, rule);
      ctx.permitted(c, rule, 'field /Kids gained the new signature field');
    }
  }
}

function ruleSignatureAdded(ctx: StepContext): void {
  const rule = 'signature-added';
  const events = ctx.newlySigned();
  if (events.length === 0) return;
  const addedThisStep = newSignatureFields(ctx);
  const beforeProtection = deriveProtection(ctx.input.before.signatures);
  const afterProtection = deriveProtection(ctx.input.after.signatures);
  const parents = new Set<number>();
  const values = new Set<number>();
  for (const { fieldObjectNumber, sig } of events) {
    const needed: ModificationLevel = sig.kind === 'timestamp' ? 'lta' : 'fill';
    if (!ctx.allows(needed)) {
      const c = ctx.byNum.get(fieldObjectNumber);
      if (c) ctx.forbidden(c, rule, `a ${sig.kind} was added under level '${ctx.level}'`);
      continue;
    }
    if (sig.catalogCertification && beforeProtection.judged !== null) {
      const c = ctx.byNum.get(fieldObjectNumber);
      if (c) ctx.forbidden(c, rule, 'a certification signature after another signature');
      continue;
    }
    const field = ctx.after.fieldByObj.get(fieldObjectNumber);
    parents.add(fieldObjectNumber);
    for (const w of field?.widgets ?? []) parents.add(w);

    // A field added in this very step was judged, and its edges claimed, by
    // signature-field-added; the table below is for signing an existing
    // field. Before the first signature nothing governs the document, and
    // the /Lock mirror written at authoring time is legitimate whatever the
    // level.
    const fieldIsNew = addedThisStep.has(fieldObjectNumber);
    const allowedFieldKeys =
      beforeProtection.judged === null
        ? new Set([...signedFieldKeysFor(ctx.level), 'Lock'])
        : signedFieldKeysFor(ctx.level);
    const fc = ctx.byNum.get(fieldObjectNumber);
    if (fc && fieldIsNew) {
      ctx.permitted(fc, rule, `new field "${sig.fieldName}" signed`);
    } else if (fc && !ctx.isIdentical(fc)) {
      const changed = changedKeys(fc.value.old, fc.value.new);
      const bad = [...changed].filter((k) => !allowedFieldKeys.has(k));
      // A condemned field still claims its stable edges: the report names
      // the cause once, not once per reference to the field.
      if (bad.length > 0) {
        ctx.forbidden(fc, rule, `signature field keys changed: ${bad.join(', ')}`);
        ctx.claimStable(fc, rule, false);
      } else if (
        changed.has('Ff') &&
        !readOnlyOnlyChange(fc, ctx.before.fieldByObj.get(fieldObjectNumber)?.flags)
      ) {
        ctx.forbidden(fc, rule, 'signature field flags changed beyond ReadOnly');
        ctx.claimStable(fc, rule, false);
      } else {
        ctx.claimStable(fc, rule);
        ctx.permitted(fc, rule, `field "${sig.fieldName}" signed`);
      }
    }
    for (const w of field?.widgets ?? []) {
      if (w === fieldObjectNumber || fieldIsNew) continue;
      const wc = ctx.byNum.get(w);
      if (!wc || ctx.isIdentical(wc)) continue;
      const bad = [...changedKeys(wc.value.old, wc.value.new)].filter(
        (k) => !SIGNED_WIDGET_KEYS.has(k),
      );
      if (bad.length > 0) {
        ctx.forbidden(wc, rule, `signature widget keys changed: ${bad.join(', ')}`);
        ctx.claimStable(wc, rule, false);
        continue;
      }
      ctx.claimStable(wc, rule);
      ctx.permitted(wc, rule, 'signature widget appearance');
    }
    // The /V value (referenced from the field, and from /Perms for a
    // certification) and the /Lock dictionary installed with the signature.
    // Claimed even when the field itself was condemned above: the report
    // then names one cause, not a cascade of unexplained edges.
    for (const c of ctx.changes) {
      if (c.change !== 'added') continue;
      const asValue = c.usage.new.filter((e) => e.parent === fieldObjectNumber && e.label === 'V');
      const asLock = c.usage.new.filter(
        (e) => e.parent === fieldObjectNumber && e.label === 'Lock',
      );
      const type = dictEntries(c.value.new)?.Type;
      if (asValue.length > 0) {
        const isSig = type?.t === 'name' && (type.v === 'Sig' || type.v === 'DocTimeStamp');
        if (!isSig && type !== undefined) continue;
        for (const e of c.usage.new) {
          if ((e.parent === fieldObjectNumber && e.label === 'V') || e.label === 'DocMDP')
            ctx.claimEdge(c, 'new', e, rule);
        }
        ctx.permitted(c, rule, 'signature value');
        values.add(c.objectNumber);
      } else if (asLock.length > 0) {
        const isLock = type === undefined || (type.t === 'name' && type.v === 'SigFieldLock');
        if (!isLock) continue;
        for (const e of asLock) ctx.claimEdge(c, 'new', e, rule);
        ctx.permitted(c, rule, 'field lock installed with the signature');
      }
    }
  }
  // /Perms: only with the certification, only in the first signed revision.
  if (afterProtection.certification && beforeProtection.judged === null) {
    const root = ctx.input.after.root;
    for (const c of ctx.changes) {
      if (c.change === 'added' && onlyEdges(c, (e) => e.parent === root && e.label === 'Perms')) {
        ctx.claimAll(c, rule);
        ctx.permitted(c, rule, 'certification permissions');
      }
    }
  }
  // Appearance streams and their resources, through the signed field or its
  // widget; and the signature value's own indirect children (/Prop_Build and
  // the like, v1/20), which the value dictionary brings with it.
  for (const side of SIDES)
    ctx.claimSubtree(side, parents, (label) => label === 'AP' || label.startsWith('AP/'), rule);
  if (values.size > 0) ctx.claimSubtree('new', values, () => true, rule);
}

/**
 * A new appearance on a signature field that is not signed, before the step
 * or after it: the field and its widgets change `/AP` and nothing else, and
 * every object under the new `/AP` is new (removed ones may go). Acrobat
 * does not count it as a change after an approval signature ("not
 * modified": whether the field had an appearance before or not, merged or
 * with a widget of its own, a picture or a drawing, corpus v4/93, 94, 97,
 * 99), and permits it under a P=2 certification (v4/101, 102). Runs at
 * `fill` and above, as every rule in the step's form block does.
 *
 * A signed field is left alone on purpose. Acrobat reports the same drawing
 * over a signed field as "not modified" too (v4/95), but there it replaces
 * the look the signature was made with, so it stays unexplained.
 */
function ruleUnsignedSignatureAppearance(ctx: StepContext): void {
  const rule = 'signature-appearance';
  const isAp = (label: string) => label === 'AP' || label.startsWith('AP/');
  const owners = new Set<number>();
  for (const [num, field] of ctx.before.fieldByObj) {
    const after = ctx.after.fieldByObj.get(num);
    if (field.kind !== 'signature' || after?.kind !== 'signature') continue;
    if (ctx.before.signedFields.has(num) || ctx.after.signedFields.has(num)) continue;
    const parts = new Set([num, ...field.widgets]);
    if (after.widgets.length !== field.widgets.length || after.widgets.some((w) => !parts.has(w))) {
      continue;
    }
    const written = [...parts]
      .map((n) => ctx.byNum.get(n))
      .filter((c): c is ObjectChange => c !== undefined && !ctx.isIdentical(c));
    // A lock has already condemned what it covers.
    if (written.length === 0 || written.some((c) => ctx.locked.has(c.objectNumber))) continue;
    const beyondAppearance = (c: ObjectChange) =>
      [...changedKeys(c.value.old, c.value.new)].filter((k) => k !== 'AP');
    if (written.some((c) => beyondAppearance(c).length > 0)) {
      // Only the appearance has a case behind it. A condemned field still
      // claims its stable edges: one cause in the report, not a cascade.
      for (const c of written) {
        const keys = beyondAppearance(c);
        if (keys.length === 0) continue;
        ctx.forbidden(
          c,
          rule,
          `signature field "${field.name}", not signed, keys changed: ${keys.join(', ')}`,
        );
        ctx.claimStable(c, rule, false);
      }
      continue;
    }
    for (const c of written) {
      ctx.claimStable(c, rule);
      ctx.permitted(c, rule, `new appearance on signature field "${field.name}", not signed`);
    }
    for (const n of parts) owners.add(n);
  }
  if (owners.size === 0) return;
  // Under the new /AP only new objects; under the old one only objects removed.
  ctx.claimSubtree('new', owners, isAp, rule, (c) => c.change === 'added');
  ctx.claimSubtree('old', owners, isAp, rule, (c) => c.change === 'freed');
}

/**
 * Did `/Ff` change by gaining ReadOnly and nothing else? `/Ff` is
 * inheritable, and a lock writes `effective | ReadOnly` into the terminal
 * dictionary, so a terminal that carried no `/Ff` of its own is judged
 * against the effective flags the older revision's form model reported.
 */
function readOnlyOnlyChange(c: ObjectChange, effectiveBefore?: number): boolean {
  const oldFf = dictEntries(c.value.old)?.Ff;
  const newFf = dictEntries(c.value.new)?.Ff;
  const before = oldFf?.t === 'number' ? oldFf.v : (effectiveBefore ?? 0);
  const after = newFf?.t === 'number' ? newFf.v : 0;
  return (before | FF_READ_ONLY) === after;
}

/**
 * Did a push button's `/MK` change in its image (`/I`) and nothing else? An
 * image is filling the button in, as Acrobat counts it: "not modified" after
 * an approval signature, "permitted by the certifying party" after a P=2
 * certification (Acrobat 26, Nov 26 2026). Its caption, colors and layout
 * (`/CA`, `/BC`, `/BG`, `/TP`) are design. An `/MK` held by reference is not
 * read through, so a change of it stays design.
 */
function imageOnlyMkChange(c: ObjectChange): boolean {
  const before = dictEntries(c.value.old)?.MK ?? null;
  const after = dictEntries(c.value.new)?.MK ?? null;
  if ((before && before.t !== 'dict') || (after && after.t !== 'dict')) return false;
  const changed = changedKeys(before, after);
  return changed.size > 0 && [...changed].every((key) => key === 'I');
}

/** A push button's image under its field or widget: the `/MK /I` drawing and what it holds. */
const isButtonImage = (label: string) => label === 'MK/I' || label.startsWith('MK/I/');
const isAppearance = (label: string) => label === 'AP' || label.startsWith('AP/');

function ruleFormFill(ctx: StepContext): void {
  const rule = 'form-fill';
  const fieldKeys = fieldKeysFor(ctx.level);
  const widgetKeys = widgetKeysFor(ctx.level);
  const parents = new Set<number>();
  /** The push buttons among `parents`: their image is claimed with their appearance. */
  const buttons = new Set<number>();
  const fields = new Map<number, RevisionField>([
    ...ctx.before.fieldByObj,
    ...ctx.after.fieldByObj,
  ]);
  for (const [num, field] of fields) {
    if (field.kind === 'signature') continue;
    const isButton = field.kind === 'pushbutton';
    /** `/MK` as filling in: a push button's image, and no other part of it. */
    const imageOnly = (c: ObjectChange) => isButton && imageOnlyMkChange(c);
    const fc = ctx.byNum.get(num);
    const widgetChanges = field.widgets
      .filter((w) => w !== num)
      .map((w) => ctx.byNum.get(w))
      .filter(Boolean) as ObjectChange[];
    // An appearance regenerated under an untouched field and widget (viewers
    // do this for NeedAppearances): the objects hanging off the field's or a
    // widget's /AP. Form filling at P=2 covers it (pyHanko agrees); what the
    // subtree may contain is still judged by the claim below.
    const owners = new Set([num, ...field.widgets]);
    // An appearance object shared with another field's /AP is nobody's
    // regeneration (pyHanko: "used in multiple contexts"); its foreign edge
    // stays unexplained unless that field is filled in the same step.
    const appearanceOnly =
      !fc && widgetChanges.length === 0
        ? ctx.changes.filter(
            (c) =>
              SIDES.some((side) =>
                c.usage[side].some((e) => owners.has(e.parent) && isAppearance(e.label)),
              ) &&
              SIDES.every((side) =>
                c.usage[side].every((e) => !isAppearance(e.label) || owners.has(e.parent)),
              ),
          )
        : [];
    if (!fc && widgetChanges.length === 0 && appearanceOnly.length === 0) continue;
    if (!ctx.allows('fill')) {
      for (const c of [fc, ...widgetChanges, ...appearanceOnly])
        if (c && !ctx.isIdentical(c))
          ctx.forbidden(c, rule, `form fill under level '${ctx.level}'`);
      continue;
    }
    if (appearanceOnly.length > 0) {
      for (const c of appearanceOnly)
        ctx.permitted(c, rule, `appearance of field "${field.name}" regenerated`);
      parents.add(num);
      for (const w of field.widgets) parents.add(w);
      continue;
    }
    let ok = true;
    if (fc && !ctx.isIdentical(fc)) {
      const changed = changedKeys(fc.value.old, fc.value.new);
      const image = changed.has('MK') && imageOnly(fc);
      const bad = [...changed].filter((k) => !fieldKeys.has(k) && !(k === 'MK' && image));
      if (bad.length > 0) {
        ctx.forbidden(fc, rule, `field "${field.name}" keys changed: ${bad.join(', ')}`);
        ctx.claimStable(fc, rule, false);
        ok = false;
      } else if (
        changed.has('Ff') &&
        !readOnlyOnlyChange(fc, ctx.before.fieldByObj.get(num)?.flags)
      ) {
        // ReadOnly may be added, on its own (v1/09, v3/64, 76); no other bit
        // has a case behind it.
        ctx.forbidden(fc, rule, `field "${field.name}" flags changed beyond adding ReadOnly`);
        ctx.claimStable(fc, rule, false);
        ok = false;
      } else {
        ctx.claimStable(fc, rule);
        const properties = [...changed].filter(
          (k) =>
            k !== 'V' &&
            k !== 'AP' &&
            k !== 'AS' &&
            k !== 'I' &&
            k !== 'RV' &&
            !(k === 'MK' && image),
        );
        ctx.permitted(
          fc,
          rule,
          properties.length > 0
            ? `field "${field.name}" ${changed.has('V') || changed.has('AS') ? 'filled, ' : ''}properties changed: ${properties.join(', ')}`
            : image
              ? `push button "${field.name}" image changed`
              : `field "${field.name}" filled`,
        );
      }
    }
    for (const wc of widgetChanges) {
      if (ctx.isIdentical(wc)) continue;
      const changed = changedKeys(wc.value.old, wc.value.new);
      const image = changed.has('MK') && imageOnly(wc);
      const bad = [...changed].filter((k) => !widgetKeys.has(k) && !(k === 'MK' && image));
      if (bad.length > 0) {
        ctx.forbidden(wc, rule, `widget of "${field.name}" keys changed: ${bad.join(', ')}`);
        ctx.claimStable(wc, rule, false);
        ok = false;
        continue;
      }
      ctx.claimStable(wc, rule);
      ctx.permitted(wc, rule, `widget of "${field.name}" ${image ? 'image' : 'appearance'}`);
    }
    if (ok) {
      parents.add(num);
      for (const w of field.widgets) parents.add(w);
      if (isButton) {
        buttons.add(num);
        for (const w of field.widgets) buttons.add(w);
      }
    }
  }
  // The appearances, and a push button's image (`/MK /I`), which its
  // appearance draws: the drawing, and what it holds.
  for (const side of SIDES)
    ctx.claimSubtree(
      side,
      parents,
      (label, parent) => isAppearance(label) || (buttons.has(parent) && isButtonImage(label)),
      rule,
    );
}

/**
 * What a change of a page's annotation list touches: `'widget'` when it adds
 * or removes a form widget that no rule permitted (a field shown or hidden),
 * `'annotations'` otherwise.
 */
function listChange(
  ctx: StepContext,
  widgets: ReadonlySet<number>,
  before: number[],
  after: number[],
): 'widget' | 'annotations' {
  const removed = before.filter((n) => !after.includes(n));
  const added = after.filter((n) => !before.includes(n));
  const touchesWidget = [...removed, ...added].some(
    (n) =>
      widgets.has(n) &&
      !ctx.findings.some((f) => f.objectNumber === n && f.verdict === 'permitted'),
  );
  return touchesWidget ? 'widget' : 'annotations';
}

function ruleAnnotation(ctx: StepContext): void {
  const rule = 'annotation';
  const pages = new Set([...ctx.before.pages, ...ctx.after.pages]);
  const widgets = new Set([...ctx.before.widgetToField.keys(), ...ctx.after.widgetToField.keys()]);
  const isWidget = (c: ObjectChange): boolean => {
    if (widgets.has(c.objectNumber)) return true;
    const sub = dictEntries(c.value.new ?? c.value.old)?.Subtype;
    return sub?.t === 'name' && sub.v === 'Widget';
  };
  const holders = annotsHolders(ctx);
  const annots: ObjectChange[] = [];
  for (const c of ctx.changes) {
    if (c.kind !== 'dictionary' || ctx.isIdentical(c)) continue;
    // Listed by a page: in the array inside the page, or in the page's list
    // object.
    const onPage = [...c.usage.old, ...c.usage.new].some(
      (e) =>
        (pages.has(e.parent) && e.label.startsWith('Annots/')) ||
        (holders.has(e.parent) && /^\[\d+\]$/.test(e.label)),
    );
    if (onPage && !isWidget(c)) annots.push(c);
  }
  if (annots.length === 0) {
    // Pages whose /Annots changed without a known annotation are judged below.
  }
  if (!ctx.allows('annotate')) {
    for (const c of annots) ctx.forbidden(c, rule, `annotation change under level '${ctx.level}'`);
    return;
  }
  const parents = new Set<number>();
  for (const c of annots) {
    ctx.claimAll(c, rule);
    ctx.permitted(c, rule, `${c.change} annotation`);
    parents.add(c.objectNumber);
  }
  for (const p of pages) {
    const c = ctx.byNum.get(p);
    if (!c || ctx.isIdentical(c)) continue;
    // A page whose /Annots a new signature field explains is already judged.
    if (
      ctx.findings.some(
        (f) =>
          f.objectNumber === p && f.rule === 'signature-field-added' && f.verdict === 'permitted',
      )
    ) {
      continue;
    }
    const changed = changedKeys(c.value.old, c.value.new);
    if (changed.size === 1 && changed.has('Annots')) {
      const before = pageList(ctx, holders, c, 'old');
      const after = pageList(ctx, holders, c, 'new');
      const listObjects = [before?.holder, after?.holder].filter((h) => h != null);
      if (!before || !after) {
        // A list in an object this step left alone, which the transport did
        // not read or which does not read as a list of references. What it
        // held is then not among the evidence, so nothing shows what the
        // change kept.
        ctx.claimAll(c, rule, false);
        for (const holder of listObjects) ctx.claimAll(holder, rule, false);
        ctx.forbidden(
          c,
          rule,
          'page /Annots points at a list object this revision did not write, and that list could not be read: what it held cannot be compared',
        );
        continue;
      }
      if (listChange(ctx, widgets, before.refs, after.refs) === 'widget') {
        ctx.forbidden(c, rule, 'page /Annots added or removed a form widget');
        continue;
      }
      ctx.claimAll(c, rule);
      ctx.permitted(c, rule, 'page /Annots changed');
      for (const holder of listObjects) {
        ctx.claimAll(holder, rule);
        ctx.permitted(holder, rule, 'page /Annots, an object of its own, changed');
      }
    }
  }
  // A list that is an object of its own and changes there: the page itself is
  // not written. Acrobat adds a comment this way (fixture
  // `signature-long-term/acrobat-lta+acrobat-comment.pdf`).
  for (const number of holders.keys()) {
    const c = ctx.byNum.get(number)!;
    if (c.change !== 'modified' || ctx.isIdentical(c)) continue;
    if (ctx.findings.some((f) => f.objectNumber === number && f.verdict === 'permitted')) continue;
    if (listChange(ctx, widgets, refsOf(c.value.old), refsOf(c.value.new)) === 'widget') {
      ctx.forbidden(c, rule, 'page /Annots added or removed a form widget');
      continue;
    }
    ctx.claimAll(c, rule);
    ctx.permitted(c, rule, 'page /Annots, an object of its own, changed');
  }
  for (const side of SIDES) {
    ctx.claimSubtree(
      side,
      parents,
      (label) => label === 'AP' || label.startsWith('AP/') || label === 'Popup' || label === 'IRT',
      rule,
    );
  }
}

function ruleFieldLock(ctx: StepContext): void {
  if (ctx.locks.length === 0) return;
  const lockedFields = ctx.input.before.fields.filter((f) =>
    ctx.locks.some((l) => lockCovers(l.spec, f.name)),
  );
  const lockedObjects = new Set<number>();
  for (const f of lockedFields) {
    lockedObjects.add(f.objectNumber);
    for (const w of f.widgets) lockedObjects.add(w);
  }
  // Their appearance subtrees (old side: what the lock froze).
  const frontier = new Set(lockedObjects);
  let grew = true;
  while (grew) {
    grew = false;
    for (const c of ctx.changes) {
      if (frontier.has(c.objectNumber)) continue;
      if (c.usage.old.length > 0 && c.usage.old.every((e) => frontier.has(e.parent))) {
        frontier.add(c.objectNumber);
        grew = true;
      }
    }
  }
  for (const c of ctx.changes) {
    if (!frontier.has(c.objectNumber) || ctx.isIdentical(c)) continue;
    const field = lockedFields.find(
      (f) => f.objectNumber === c.objectNumber || f.widgets.includes(c.objectNumber),
    );
    // A locked field may still gain ReadOnly and nothing else (v3/76: "not
    // modified"). Its value, appearance, tooltip, visibility and placement
    // are frozen (v1/28, v2/51, v3/73, 74, 80; 49 and 75 are accepted by
    // Acrobat and kept frozen on purpose: a lock that lets the field move
    // or redraw is not the guarantee it promises).
    if (field && field.objectNumber === c.objectNumber) {
      const changed = changedKeys(c.value.old, c.value.new);
      if (
        changed.size === 1 &&
        changed.has('Ff') &&
        readOnlyOnlyChange(c, ctx.before.fieldByObj.get(c.objectNumber)?.flags)
      ) {
        ctx.claimStable(c, 'field-lock');
        ctx.permitted(c, 'field-lock', `ReadOnly set on locked field "${field.name}"`);
        continue;
      }
    }
    ctx.locked.add(c.objectNumber);
    ctx.forbidden(
      c,
      'field-lock',
      field ? `field "${field.name}" is locked by the signature` : 'part of a locked field changed',
    );
  }
}

function ruleUnexplained(ctx: StepContext): void {
  for (const c of ctx.changes) {
    if (c.value.truncated) {
      ctx.findings.push({
        rule: 'unexplained',
        verdict: 'incomplete',
        objectNumber: c.objectNumber,
        detail: 'value too large to inspect',
      });
      continue;
    }
    if (c.usageIncomplete) {
      ctx.findings.push({
        rule: 'unexplained',
        verdict: 'incomplete',
        objectNumber: c.objectNumber,
        detail: 'references could not be resolved within budget (depth, fan-out or total reads)',
      });
      continue;
    }
    if (ctx.locked.has(c.objectNumber)) continue;
    for (const side of SIDES) {
      for (const e of c.usage[side]) {
        if (!ctx.isClaimed(c, side, e)) {
          ctx.forbidden(
            c,
            'unexplained',
            `${side === 'old' ? 'was' : 'is'} referenced from object ${e.parent} at ${e.label} and no rule explains it`,
            e,
          );
        }
      }
    }
    if (
      c.usage.old.length === 0 &&
      c.usage.new.length === 0 &&
      !ctx.findings.some((f) => f.objectNumber === c.objectNumber)
    ) {
      ctx.permitted(c, 'orphan', 'referenced from nowhere reachable');
    }
  }
}
