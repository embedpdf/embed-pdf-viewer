import type { DocumentFieldLock, ModificationLevel } from '../types';
import type { PdfValue } from './types';
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
} from './types';

type Side = 'old' | 'new';
const SIDES: Side[] = ['old', 'new'];

const TRAILER_KEYS = new Set([
  'Size', 'Prev', 'XRefStm', 'Info', 'ID', 'Root',
  'Type', 'W', 'Index', 'Filter', 'DecodeParms', 'Length', 'Encrypt',
]);
const CATALOG_KEYS = new Set(['Metadata', 'Extensions', 'Version', 'DSS', 'AcroForm', 'Perms']);
const ACROFORM_KEYS = new Set(['DR', 'DA', 'Q', 'SigFlags', 'NeedAppearances', 'Fields']);
const FILL_FIELD_KEYS = new Set(['V', 'AS', 'AP', 'I', 'DA', 'Ff', 'RV']);
const FILL_WIDGET_KEYS = new Set(['AS', 'AP', 'DA']);
// Signing an EXISTING field may set its value, appearance and ReadOnly, nothing
// else. /Lock is authoring-time metadata: adding it to a field that already
// exists under an earlier signature is a field-dictionary change no earlier
// signature permits (pyHanko and Acrobat reject it); the FieldMDP transform
// in the signature value carries the lock on its own.
const SIGNED_FIELD_KEYS = new Set(['V', 'AP', 'AS', 'Ff']);
const SIGNED_WIDGET_KEYS = new Set(['AP', 'AS']);
const FF_READ_ONLY = 1;

/** The level a step runs at, and the locks it enforces: what the OLDER revision's signatures established. */
export function restrictionsOf(before: RevisionStructure): {
  level: ModificationLevel;
  locks: DocumentFieldLock[];
} {
  const protection = deriveProtection(before.signatures);
  // Nothing signed yet: nothing forbids, the rule set explains what it can.
  return { level: protection.level ?? 'annotate', locks: protection.fieldLocks };
}

/**
 * Judge one pairwise step. Every reference to a changed object, in the
 * older AND the newer revision, must be claimed by a rule that inspected
 * that use; an unclaimed reference is `unexplained` and forbidden. A
 * truncated value is `incomplete`, never permitted. Pure: JSON in, JSON
 * out, the same code in the browser worker, on the server and in tests.
 */
export function evaluateStep(input: StepInput): RevisionAnalysis {
  const changes = withEvidenceCheck(input.changes);
  const { level, locks } = restrictionsOf(input.before);
  const levelInForce = input.levelOverride ?? level;
  const ctx = new StepContext({ ...input, changes }, levelInForce, locks);

  ruleXrefContainer(ctx);
  ruleIdenticalRewrite(ctx);
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
  ruleFormFill(ctx);
  ruleAnnotation(ctx);
  ruleUnexplained(ctx);

  const verdict: StepVerdict =
    changes.length === 0
      ? 'unchanged'
      : ctx.findings.some((f) => f.verdict === 'incomplete')
        ? 'indeterminate'
        : ctx.findings.some((f) => f.verdict === 'forbidden')
          ? 'forbidden'
          : 'permitted';

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
    const missingOld = c.present.old && c.value.old === null;
    const missingNew = c.present.new && c.value.new === null;
    return missingOld || missingNew ? { ...c, value: { ...c.value, truncated: true } } : c;
  });
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
    if (f.family === 'signature') sigFields.add(f.objectNumber);
    for (const w of f.widgets) widgetToField.set(w, f.objectNumber);
  }
  const signedFields = new Set<number>();
  for (const sig of s.signatures) {
    if (sig.signed && sig.field.kind === 'objectNumber') signedFields.add(sig.field.fieldObjectNumber);
  }
  return { fieldByObj, widgetToField, pages: new Set(s.pages), signedFields, sigFields };
}

function edgeKey(e: ObjectReferrer): string {
  return `${e.parent}:${e.label}`;
}

class StepContext {
  readonly findings: ChangeFinding[] = [];
  readonly byNum = new Map<number, ObjectChange>();
  readonly before: RoleIndex;
  readonly after: RoleIndex;
  /** `${objectNumber}:${side}:${edge}` → rule. */
  private readonly claims = new Map<string, string>();
  /** Objects a lock forbids touching this step. */
  readonly locked = new Set<number>();

  constructor(
    readonly input: StepInput,
    readonly level: ModificationLevel,
    readonly locks: DocumentFieldLock[],
  ) {
    for (const c of input.changes) this.byNum.set(c.objectNumber, c);
    this.before = indexRoles(input.before);
    this.after = indexRoles(input.after);
  }

  get changes(): ObjectChange[] {
    return this.input.changes;
  }

  allows(needed: ModificationLevel): boolean {
    return levelAllows(this.level, needed);
  }

  claimEdge(c: ObjectChange, side: Side, edge: ObjectReferrer, rule: string): void {
    if (this.locked.has(c.objectNumber)) return;
    const key = `${c.objectNumber}:${side}:${edgeKey(edge)}`;
    if (!this.claims.has(key)) this.claims.set(key, rule);
  }

  claimAll(c: ObjectChange, rule: string): void {
    for (const side of SIDES) for (const e of c.usage[side]) this.claimEdge(c, side, e, rule);
  }

  /** Claim the references that are the same in both revisions; a reference gained or lost stays unexplained. */
  claimStable(c: ObjectChange, rule: string): void {
    const oldKeys = new Set(c.usage.old.map(edgeKey));
    const newKeys = new Set(c.usage.new.map(edgeKey));
    for (const e of c.usage.old) if (newKeys.has(edgeKey(e))) this.claimEdge(c, 'old', e, rule);
    for (const e of c.usage.new) if (oldKeys.has(edgeKey(e))) this.claimEdge(c, 'new', e, rule);
  }

  isClaimed(c: ObjectChange, side: Side, edge: ObjectReferrer): boolean {
    return this.claims.has(`${c.objectNumber}:${side}:${edgeKey(edge)}`);
  }

  permitted(c: ObjectChange, rule: string, detail?: string): void {
    if (this.locked.has(c.objectNumber)) return;
    this.findings.push({ rule, verdict: 'permitted', objectNumber: c.objectNumber, detail });
  }

  forbidden(c: ObjectChange, rule: string, detail: string, edge?: ObjectReferrer): void {
    this.findings.push({
      rule,
      verdict: 'forbidden',
      objectNumber: c.objectNumber,
      edge: edge ? edgeKey(edge) : undefined,
      detail,
    });
  }

  /**
   * Claim every reference under a set of parents (an appearance subtree,
   * the DSS): objects whose references come from `parents` through labels
   * `accept`, then everything referenced from those objects, and so on.
   * Runs per side, because a replaced appearance stream exists on one
   * side only.
   */
  claimSubtree(
    side: Side,
    roots: Set<number>,
    accept: (label: string) => boolean,
    rule: string,
  ): void {
    // Two sets, never merged: an edge from a ROOT is inside the subtree
    // only through an accepted label, on every pass; an edge from an object
    // that JOINED is inside through any label. Folding the roots into the
    // frontier would let one accepted child (an appearance stream, a DSS
    // update) vouch for every other edge off the same parent.
    const joined = new Set<number>();
    let grew = true;
    while (grew) {
      grew = false;
      for (const c of this.changes) {
        if (roots.has(c.objectNumber) || joined.has(c.objectNumber)) continue;
        const edges = c.usage[side];
        if (edges.length === 0) continue;
        const inside = edges.filter((e) => (roots.has(e.parent) && accept(e.label)) || joined.has(e.parent));
        if (inside.length === 0) continue;
        for (const e of inside) this.claimEdge(c, side, e, rule);
        // Only an object referenced from nowhere else joins the subtree:
        // a shared resource keeps its other references unexplained.
        if (inside.length === edges.length) {
          joined.add(c.objectNumber);
          grew = true;
        }
      }
    }
  }

  isIdentical(c: ObjectChange): boolean {
    return c.raw.old !== null && c.raw.new !== null && c.raw.old === c.raw.new && !c.streamDataChanged;
  }

  /** Signatures signed in the newer revision but not the older: this step's signing events. */
  newlySigned(): Array<{ fieldObjectNumber: number; sig: RevisionStructure['signatures'][number] }> {
    const out: Array<{ fieldObjectNumber: number; sig: RevisionStructure['signatures'][number] }> = [];
    for (const sig of this.input.after.signatures) {
      if (!sig.signed || sig.field.kind !== 'objectNumber') continue;
      if (this.before.signedFields.has(sig.field.fieldObjectNumber)) continue;
      out.push({ fieldObjectNumber: sig.field.fieldObjectNumber, sig });
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
      ctx.permitted(c, 'xref-container', 'cross-reference container; members are judged on their own');
    }
  }
}

function ruleIdenticalRewrite(ctx: StepContext): void {
  for (const c of ctx.changes) {
    if (c.change === 'modified' && ctx.isIdentical(c)) {
      ctx.claimAll(c, 'identical-rewrite');
      ctx.permitted(c, 'identical-rewrite', 'rewritten byte-identically');
    }
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
  if (changed.has('Encrypt') && !pdfValueEquals(dictEntries(c.value.old)?.Encrypt ?? null, dictEntries(c.value.new)?.Encrypt ?? null)) {
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
    if (c.objectNumber !== 0 && onlyEdges(c, (e) => e.parent === 0 && e.label === 'Info')) {
      ctx.claimAll(c, 'info');
      ctx.permitted(c, 'info', 'document information dictionary');
    }
  }
}

function ruleMetadata(ctx: StepContext): void {
  const roots = new Set([ctx.input.before.root, ctx.input.after.root]);
  for (const c of ctx.changes) {
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
  // A DIRECT /AcroForm dictionary changes with the catalog: judge it by the
  // AcroForm rules, and let its default resources ride the catalog's edges.
  if (changed.has('AcroForm') && !ctx.input.after.acroForm && !ctx.input.before.acroForm) {
    const problem = acroFormProblem(ctx, dictEntries(c.value.old)?.AcroForm ?? null, dictEntries(c.value.new)?.AcroForm ?? null);
    if (problem) {
      ctx.forbidden(c, 'acroform-housekeeping', problem);
      return;
    }
    for (const side of SIDES) {
      ctx.claimSubtree(side, new Set([root]), (label) => label.startsWith('AcroForm/DR/'), 'acroform-housekeeping');
    }
  }
  if (changed.has('Perms')) {
    const after = deriveProtection(ctx.input.after.signatures);
    const before = deriveProtection(ctx.input.before.signatures);
    if (!after.certification || before.level !== null) {
      ctx.forbidden(c, 'catalog-housekeeping', '/Perms may only appear with the certification signature, in the first signed revision');
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
    ctx.claimSubtree(side, new Set([acro]), (label) => label.startsWith('DR/'), 'acroform-housekeeping');
  }
}

/** What is wrong with an AcroForm dictionary change, or null when it is housekeeping. */
function acroFormProblem(ctx: StepContext, oldValue: PdfValue | null, newValue: PdfValue | null): string | null {
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
    if (strangers.length > 0) return `/AcroForm /Fields gained non-signature fields: ${strangers.join(', ')}`;
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
    if (c.usage.new.some((e) => roots.has(e.parent) && e.label === 'DSS') && !ctx.findings.some((f) => f.objectNumber === c.objectNumber)) {
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
  // The page that lists the new widget: /Annots append-only.
  for (const p of ctx.after.pages) {
    const c = ctx.byNum.get(p);
    if (!c || ctx.isIdentical(c)) continue;
    const changed = changedKeys(c.value.old, c.value.new);
    if (changed.size !== 1 || !changed.has('Annots')) continue;
    const appended = appendedRefs(c, 'Annots');
    if (appended && appended.every((n) => newWidgets.has(n))) {
      ctx.claimAll(c, rule);
      ctx.permitted(c, rule, 'page /Annots gained the new signature widget');
    }
  }
  // A parent field whose /Kids gained the new field.
  for (const c of ctx.changes) {
    if (c.kind !== 'dictionary' || ctx.isIdentical(c)) continue;
    const changed = changedKeys(c.value.old, c.value.new);
    if (changed.size !== 1 || !changed.has('Kids')) continue;
    const appended = appendedRefs(c, 'Kids');
    if (appended && appended.length > 0 && appended.every((n) => added.has(n) || newWidgets.has(n))) {
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
  for (const { fieldObjectNumber, sig } of events) {
    const needed: ModificationLevel = sig.kind === 'timestamp' ? 'lta' : 'fill';
    if (!ctx.allows(needed)) {
      const c = ctx.byNum.get(fieldObjectNumber);
      if (c) ctx.forbidden(c, rule, `a ${sig.kind} was added under level '${ctx.level}'`);
      continue;
    }
    if (sig.catalogCertification && beforeProtection.level !== null) {
      const c = ctx.byNum.get(fieldObjectNumber);
      if (c) ctx.forbidden(c, rule, 'a certification signature after another signature');
      continue;
    }
    const field = ctx.after.fieldByObj.get(fieldObjectNumber);
    parents.add(fieldObjectNumber);
    for (const w of field?.widgets ?? []) parents.add(w);

    // A field added in this very step was judged, and its edges claimed, by
    // signature-field-added; the whitelist below is for signing an EXISTING
    // field, where every key but the signing ones must stay put.
    const fieldIsNew = addedThisStep.has(fieldObjectNumber);
    // Before the first signature nothing governs the document, and the /Lock
    // mirror written at authoring time is legitimate; after one, it is not.
    const allowedFieldKeys = beforeProtection.level === null ? new Set([...SIGNED_FIELD_KEYS, 'Lock']) : SIGNED_FIELD_KEYS;
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
        ctx.claimStable(fc, rule);
      } else if (changed.has('Ff') && !readOnlyOnlyChange(fc, ctx.before.fieldByObj.get(fieldObjectNumber)?.flags)) {
        ctx.forbidden(fc, rule, 'signature field flags changed beyond ReadOnly');
        ctx.claimStable(fc, rule);
      } else {
        ctx.claimStable(fc, rule);
        ctx.permitted(fc, rule, `field "${sig.fieldName}" signed`);
      }
    }
    for (const w of field?.widgets ?? []) {
      if (w === fieldObjectNumber || fieldIsNew) continue;
      const wc = ctx.byNum.get(w);
      if (!wc || ctx.isIdentical(wc)) continue;
      const bad = [...changedKeys(wc.value.old, wc.value.new)].filter((k) => !SIGNED_WIDGET_KEYS.has(k));
      if (bad.length > 0) {
        ctx.forbidden(wc, rule, `signature widget keys changed: ${bad.join(', ')}`);
        ctx.claimStable(wc, rule);
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
      const asLock = c.usage.new.filter((e) => e.parent === fieldObjectNumber && e.label === 'Lock');
      const type = dictEntries(c.value.new)?.Type;
      if (asValue.length > 0) {
        const isSig = type?.t === 'name' && (type.v === 'Sig' || type.v === 'DocTimeStamp');
        if (!isSig && type !== undefined) continue;
        for (const e of c.usage.new) {
          if ((e.parent === fieldObjectNumber && e.label === 'V') || e.label === 'DocMDP') ctx.claimEdge(c, 'new', e, rule);
        }
        ctx.permitted(c, rule, 'signature value');
      } else if (asLock.length > 0) {
        const isLock = type === undefined || (type.t === 'name' && type.v === 'SigFieldLock');
        if (!isLock) continue;
        for (const e of asLock) ctx.claimEdge(c, 'new', e, rule);
        ctx.permitted(c, rule, 'field lock installed with the signature');
      }
    }
  }
  // /Perms: only with the certification, only in the first signed revision.
  if (afterProtection.certification && beforeProtection.level === null) {
    const root = ctx.input.after.root;
    for (const c of ctx.changes) {
      if (c.change === 'added' && onlyEdges(c, (e) => e.parent === root && e.label === 'Perms')) {
        ctx.claimAll(c, rule);
        ctx.permitted(c, rule, 'certification permissions');
      }
    }
  }
  // Appearance streams and their resources, through the signed field or its widget.
  for (const side of SIDES) ctx.claimSubtree(side, parents, (label) => label === 'AP' || label.startsWith('AP/'), rule);
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

function ruleFormFill(ctx: StepContext): void {
  const rule = 'form-fill';
  const newlyLocked = new Set<string>();
  for (const { sig } of ctx.newlySigned()) {
    for (const spec of [sig.fieldMdp, sig.lock]) {
      if (!spec) continue;
      for (const f of ctx.input.after.fields) if (lockCovers(spec, f.name)) newlyLocked.add(f.name);
    }
  }
  const parents = new Set<number>();
  const fields = new Map<number, RevisionField>([
    ...ctx.before.fieldByObj,
    ...ctx.after.fieldByObj,
  ]);
  for (const [num, field] of fields) {
    if (field.family === 'signature') continue;
    const fc = ctx.byNum.get(num);
    const widgetChanges = field.widgets.filter((w) => w !== num).map((w) => ctx.byNum.get(w)).filter(Boolean) as ObjectChange[];
    // An appearance regenerated under an untouched field and widget (viewers
    // do this for NeedAppearances): the objects hanging off the field's or a
    // widget's /AP. Form filling at P=2 covers it (pyHanko agrees); what the
    // subtree may contain is still judged by the claim below.
    const owners = new Set([num, ...field.widgets]);
    const isAp = (label: string) => label === 'AP' || label.startsWith('AP/');
    // An appearance object shared with another field's /AP is nobody's
    // regeneration (pyHanko: "used in multiple contexts"); its foreign edge
    // stays unexplained unless that field is filled in the same step.
    const appearanceOnly =
      !fc && widgetChanges.length === 0
        ? ctx.changes.filter(
            (c) =>
              SIDES.some((side) => c.usage[side].some((e) => owners.has(e.parent) && isAp(e.label))) &&
              SIDES.every((side) => c.usage[side].every((e) => !isAp(e.label) || owners.has(e.parent))),
          )
        : [];
    if (!fc && widgetChanges.length === 0 && appearanceOnly.length === 0) continue;
    if (!ctx.allows('fill')) {
      for (const c of [fc, ...widgetChanges, ...appearanceOnly]) if (c && !ctx.isIdentical(c)) ctx.forbidden(c, rule, `form fill under level '${ctx.level}'`);
      continue;
    }
    if (appearanceOnly.length > 0) {
      for (const c of appearanceOnly) ctx.permitted(c, rule, `appearance of field "${field.name}" regenerated`);
      parents.add(num);
      for (const w of field.widgets) parents.add(w);
      continue;
    }
    let ok = true;
    if (fc && !ctx.isIdentical(fc)) {
      const changed = changedKeys(fc.value.old, fc.value.new);
      const bad = [...changed].filter((k) => !FILL_FIELD_KEYS.has(k));
      if (bad.length > 0) {
        ctx.forbidden(fc, rule, `field "${field.name}" keys changed: ${bad.join(', ')}`);
        ok = false;
      } else if (
        changed.has('Ff') &&
        !(readOnlyOnlyChange(fc, ctx.before.fieldByObj.get(num)?.flags) && newlyLocked.has(field.name))
      ) {
        ctx.forbidden(fc, rule, `field "${field.name}" flags changed (only a lock landing in this revision may set ReadOnly)`);
        ok = false;
      } else {
        ctx.claimStable(fc, rule);
        ctx.permitted(fc, rule, `field "${field.name}" filled`);
      }
    }
    for (const wc of widgetChanges) {
      if (ctx.isIdentical(wc)) continue;
      const bad = [...changedKeys(wc.value.old, wc.value.new)].filter((k) => !FILL_WIDGET_KEYS.has(k));
      if (bad.length > 0) {
        ctx.forbidden(wc, rule, `widget of "${field.name}" keys changed: ${bad.join(', ')}`);
        ok = false;
        continue;
      }
      ctx.claimStable(wc, rule);
      ctx.permitted(wc, rule, `widget of "${field.name}" appearance`);
    }
    if (ok) {
      parents.add(num);
      for (const w of field.widgets) parents.add(w);
    }
  }
  for (const side of SIDES) ctx.claimSubtree(side, parents, (label) => label === 'AP' || label.startsWith('AP/'), rule);
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
  const annots: ObjectChange[] = [];
  for (const c of ctx.changes) {
    if (c.kind !== 'dictionary' || ctx.isIdentical(c)) continue;
    const onPage = [...c.usage.old, ...c.usage.new].some((e) => pages.has(e.parent) && e.label.startsWith('Annots/'));
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
    const changed = changedKeys(c.value.old, c.value.new);
    if (changed.size === 1 && changed.has('Annots')) {
      const removed = refsOf(dictEntries(c.value.old)?.Annots).filter((n) => !refsOf(dictEntries(c.value.new)?.Annots).includes(n));
      const added = refsOf(dictEntries(c.value.new)?.Annots).filter((n) => !refsOf(dictEntries(c.value.old)?.Annots).includes(n));
      const touchesWidget = [...removed, ...added].some((n) => widgets.has(n) && !ctx.findings.some((f) => f.objectNumber === n && f.verdict === 'permitted'));
      if (touchesWidget) {
        ctx.forbidden(c, rule, 'page /Annots added or removed a form widget');
        continue;
      }
      ctx.claimAll(c, rule);
      ctx.permitted(c, rule, 'page /Annots changed');
    }
  }
  for (const side of SIDES) {
    ctx.claimSubtree(side, parents, (label) => label === 'AP' || label.startsWith('AP/') || label === 'Popup' || label === 'IRT', rule);
  }
}

function ruleFieldLock(ctx: StepContext): void {
  if (ctx.locks.length === 0) return;
  const lockedFields = ctx.input.before.fields.filter((f) => ctx.locks.some((l) => lockCovers(l.spec, f.name)));
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
    const field = lockedFields.find((f) => f.objectNumber === c.objectNumber || f.widgets.includes(c.objectNumber));
    ctx.locked.add(c.objectNumber);
    ctx.forbidden(c, 'field-lock', field ? `field "${field.name}" is locked by an earlier signature` : 'part of a locked field changed');
  }
}

function ruleUnexplained(ctx: StepContext): void {
  for (const c of ctx.changes) {
    if (c.value.truncated) {
      ctx.findings.push({ rule: 'unexplained', verdict: 'incomplete', objectNumber: c.objectNumber, detail: 'value too large to inspect' });
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
          ctx.forbidden(c, 'unexplained', `${side === 'old' ? 'was' : 'is'} referenced from object ${e.parent} at ${e.label} and no rule explains it`, e);
        }
      }
    }
    if (c.usage.old.length === 0 && c.usage.new.length === 0 && !ctx.findings.some((f) => f.objectNumber === c.objectNumber)) {
      ctx.permitted(c, 'orphan', 'referenced from nowhere reachable');
    }
  }
}
