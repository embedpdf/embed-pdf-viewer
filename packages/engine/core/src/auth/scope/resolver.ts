import { materializePdfPermissions } from './builders';
import { parseScope } from './parser';
import type {
  CollabAction,
  CollabEntity,
  CollabFilter,
  DocCapability,
  Identity,
  ParsedScope,
  PdfBits,
} from './types';
import { protectedCapabilities } from '../../signature/protection';
import type { DocumentProtection } from '../../signature/types';

/**
 * Resolved collab subject — the per-record identity bits that collab
 * filters are tested against. Sourced from the target record's stored
 * `/EMBD_Metadata/UserID` and `/GroupID` at mutation time.
 */
export interface CollabTarget {
  userId?: string;
  groupId?: string;
}

/** The collab target of a record read with nullable owner fields (an annotation). */
export function collabTargetOf(owner: {
  userId?: string | null;
  groupId?: string | null;
}): CollabTarget {
  return {
    ...(owner.userId ? { userId: owner.userId } : {}),
    ...(owner.groupId ? { groupId: owner.groupId } : {}),
  };
}

/**
 * True iff the given capability is granted by the scope array plus the
 * PDF bits visible via `pdf.permissions` expansion.
 *
 * Wildcard `*` short-circuits to true. Anything not explicitly granted
 * (or expanded from `pdf.permissions`) is denied.
 */
export function checkCapability(
  capability: DocCapability,
  rawScope: ReadonlyArray<string>,
  pdfBits: PdfBits,
  protection: DocumentProtection | null = null,
): boolean {
  // Document-derived authority comes first: what the signatures in the
  // file forbid, no scope grants — the wildcard included.
  if (protectedCapabilities(protection).has(capability)) return false;
  const parsed = rawScope.map(parseScope);
  if (parsed.some((s) => s.kind === 'wildcard')) return true;
  return expandedCapabilities(parsed, pdfBits, protection).has(capability);
}

/**
 * True iff the scope grants at least one of `capabilities`. Convenience
 * for routes like `/text` (`doc.text.copy` or `doc.text.search`) and
 * `/geometry` (`doc.text.select` or `doc.text.search`).
 */
export function checkAnyCapability(
  capabilities: ReadonlyArray<DocCapability>,
  rawScope: ReadonlyArray<string>,
  pdfBits: PdfBits,
  protection: DocumentProtection | null = null,
): boolean {
  return capabilities.some((c) => checkCapability(c, rawScope, pdfBits, protection));
}

/**
 * True iff the scope grants the collab action against the target record.
 *
 * Narrowing model. For each action independently:
 *   1. wildcard `*` → allow (global escape hatch)
 *   2. if any collab scope applies to this action → narrow: only those
 *      collab filters decide. If none match the target, deny — even if
 *      `doc.annotate.modify` is also present. This is what makes
 *      `[modify, update:self]` correctly mean "edit own only" rather
 *      than "edit anyone via modify-bypass."
 *   3. otherwise, if `doc.annotate.modify` is present → allow. This is
 *      the broad PDF-bit-derived default for create/update/delete when
 *      no per-action collab filter has been written.
 *   4. otherwise → deny.
 *
 * For create: `target` should be built by the caller from JWT identity
 * (`{ userId: caller.userId, groupId: caller.groupId }`). `:self` and
 * `:all` then trivially pass; `:group=X` is the meaningful filter (only
 * matches when the caller's default group is X).
 *
 * For update / delete: `target` is the existing row's owner.
 */
export function checkCollab(
  action: CollabAction,
  target: CollabTarget,
  rawScope: ReadonlyArray<string>,
  identity: Identity,
  pdfBits: PdfBits,
): boolean {
  const parsed = rawScope.map(parseScope);
  if (parsed.some((s) => s.kind === 'wildcard')) return true;

  const applicableCollab = parsed.filter(
    (s): s is Extract<ParsedScope, { entity: 'annotations' }> =>
      s.kind === 'collab' &&
      s.entity === 'annotations' &&
      (s.action === action || s.action === '*'),
  );

  if (applicableCollab.length > 0) {
    // Narrow: presence of any applicable collab scope shadows
    // `modify`-as-default for this action.
    return applicableCollab.some((s) => filterMatches(s.filter, target, identity));
  }

  // No collab scope for this action — fall back to the broad default.
  return expandedCapabilities(parsed, pdfBits).has('doc.annotate.modify');
}

/**
 * Compute the full set of granted capabilities after expanding
 * `pdf.permissions` and applying implication rules.
 *
 * Implications applied:
 *   - `doc.annotate.modify` implies `doc.annotate.read` (you can't
 *     sensibly modify what you can't see).
 *   - `doc.forms.modify` implies `doc.forms.fill` and `doc.forms.read`.
 *   - `doc.forms.fill`   implies `doc.forms.read`.
 *   - any annotation collab scope implies `doc.annotate.read`, because
 *     mutation routes need to see the target row to evaluate the
 *     collab filter against its current owner.
 *   - any field collab scope implies `doc.forms.read`: filling in or
 *     signing a field means seeing the form. Groups limit writes, never
 *     reads.
 *
 * Does not short-circuit on wildcard — callers do that themselves
 * before calling this. Returning the expanded set is useful for the
 * `/access` response's `effectiveScope` and for advisory UI surfacing.
 */
export function expandedCapabilities(
  parsed: ReadonlyArray<ParsedScope>,
  pdfBits: PdfBits,
  protection: DocumentProtection | null = null,
): Set<DocCapability> {
  const out = new Set<DocCapability>();
  let hasAnnotationCollab = false;
  let hasFieldCollab = false;

  for (const s of parsed) {
    if (s.kind === 'capability') {
      out.add(s.name);
    } else if (s.kind === 'virtual' && s.name === 'pdf.permissions') {
      addPdfPermissions(out, pdfBits);
    } else if (s.kind === 'collab' && s.entity === 'annotations') {
      hasAnnotationCollab = true;
    } else if (s.kind === 'collab' && s.entity === 'fields') {
      hasFieldCollab = true;
    }
  }

  // Implications (apply after the explicit additions above)
  if (out.has('doc.annotate.modify')) out.add('doc.annotate.read');
  if (out.has('doc.forms.modify')) {
    out.add('doc.forms.fill');
    out.add('doc.forms.read');
  }
  if (out.has('doc.forms.fill')) out.add('doc.forms.read');
  if (hasAnnotationCollab) out.add('doc.annotate.read');
  if (hasFieldCollab) out.add('doc.forms.read');

  // Subtraction last: a signed document's own restrictions win over any
  // grant or implication.
  for (const removed of protectedCapabilities(protection)) out.delete(removed);

  return out;
}

/**
 * Convenience wrapper: takes the raw scope array, parses each entry,
 * returns the expanded capability set. Exposed for the `/access`
 * endpoint and for the SDK helper that surfaces `effectiveScope`.
 */
export function expandRawScope(
  rawScope: ReadonlyArray<string>,
  pdfBits: PdfBits,
  protection: DocumentProtection | null = null,
): Set<DocCapability> {
  return expandedCapabilities(rawScope.map(parseScope), pdfBits, protection);
}

/**
 * Authority to put a record of `entity` in a specific group: an annotation,
 * or a form field.
 *
 * Set-group is decoupled from the write capabilities (`doc.annotate.modify`,
 * `doc.forms.modify`). The reasoning: those describe row access — what kind
 * of write you can do to which existing rows — and map to PDF permission
 * bits. Set-group is a cloud-only *assignment authority*: which destination
 * group can you put a record into? There is no PDF-bit counterpart, so it
 * doesn't inherit from them.
 *
 * Resolution order:
 *   1. newGroupId === callerDefaultGroupId → true (no real reassignment
 *      is happening; the record gets the caller's default group)
 *   2. wildcard `*` → true (global escape hatch)
 *   3. `<entity>:set-group:all` → true
 *   4. `<entity>:set-group:group=<newGroupId>` → true
 *   5. `<entity>:*:all` or `<entity>:*:group=<newGroupId>` → true
 *      (action wildcard includes set-group)
 *   6. otherwise → false
 *
 * A user with `set-group:group=legal` can put records in the legal group
 * whatever their own group is — that's the whole point.
 */
export function checkSetGroup(
  entity: CollabEntity,
  newGroupId: string,
  callerDefaultGroupId: string | undefined,
  rawScope: ReadonlyArray<string>,
): boolean {
  // No authority needed when the caller is assigning their default group.
  if (newGroupId === callerDefaultGroupId) return true;

  const parsed = rawScope.map(parseScope);
  if (parsed.some((s) => s.kind === 'wildcard')) return true;

  for (const s of parsed) {
    if (s.kind !== 'collab') continue;
    if (s.entity !== entity) continue;
    if (s.action !== 'set-group' && s.action !== '*') continue;
    if (s.filter.kind === 'all') return true;
    if (s.filter.kind === 'group' && s.filter.groupId === newGroupId) return true;
    // :self and :createdBy are rejected at parse time for set-group, so
    // they never appear here. The action-wildcard path could carry those
    // filters legitimately for other actions — silently skip those, they
    // can't satisfy a set-group check.
  }
  return false;
}

/**
 * True iff the scope lets the caller `action` (fill in, or sign) a form
 * field in `groupId` (`null` for a field in no group).
 *
 * Narrowing, per action, as for annotations:
 *   1. wildcard `*` → allow;
 *   2. if any `fields:<action>` scope exists (or `fields:*`) → only those
 *      decide: the field must match one of their filters, even when the
 *      broad capability is also present. A field in no group then matches
 *      only `:all`;
 *   3. otherwise the broad capability decides, for every field:
 *      `doc.forms.fill` to fill, `doc.sign` to sign.
 *
 * Nothing here narrows form design (`doc.forms.modify`).
 */
export function checkFieldAction(
  action: 'fill' | 'sign',
  groupId: string | null,
  rawScope: ReadonlyArray<string>,
  pdfBits: PdfBits,
  protection: DocumentProtection | null = null,
): boolean {
  const broad: DocCapability = action === 'fill' ? 'doc.forms.fill' : 'doc.sign';
  if (protectedCapabilities(protection).has(broad)) return false;
  const parsed = rawScope.map(parseScope);
  if (parsed.some((s) => s.kind === 'wildcard')) return true;

  const applicable = parsed.filter(
    (s) =>
      s.kind === 'collab' && s.entity === 'fields' && (s.action === action || s.action === '*'),
  ) as Extract<ParsedScope, { entity: 'fields' }>[];
  if (applicable.length > 0) {
    return applicable.some(
      (s) => s.filter.kind === 'all' || (groupId !== null && s.filter.groupId === groupId),
    );
  }
  return expandedCapabilities(parsed, pdfBits, protection).has(broad);
}

/**
 * Whether the scope lets the caller `action` some form field: the broad
 * capability, or any `fields:<action>` scope. What a form verb checks
 * before its fields are known; each field is checked in the write.
 */
export function checkAnyFieldAction(
  action: 'fill' | 'sign',
  rawScope: ReadonlyArray<string>,
  pdfBits: PdfBits,
  protection: DocumentProtection | null = null,
): boolean {
  const broad: DocCapability = action === 'fill' ? 'doc.forms.fill' : 'doc.sign';
  if (protectedCapabilities(protection).has(broad)) return false;
  const parsed = rawScope.map(parseScope);
  if (parsed.some((s) => s.kind === 'wildcard')) return true;
  if (
    parsed.some(
      (s) =>
        s.kind === 'collab' && s.entity === 'fields' && (s.action === action || s.action === '*'),
    )
  ) {
    return true;
  }
  return expandedCapabilities(parsed, pdfBits, protection).has(broad);
}

/**
 * Test a single collab filter against a target record. Every filter but
 * `self` compares one fact on the record with the value the scope names:
 *
 *   all              → always matches
 *   self             → matches if identity.userId === target.userId
 *   createdBy=<X>    → matches if target.userId === X
 *   group=<X>        → matches if target.groupId === X
 */
export function filterMatches(filter: CollabFilter, target: CollabTarget, id: Identity): boolean {
  switch (filter.kind) {
    case 'all':
      return true;
    case 'self':
      return !!id.userId && target.userId === id.userId;
    case 'createdBy':
      return target.userId === filter.userId;
    case 'group':
      return target.groupId === filter.groupId;
  }
}

/**
 * Translate `pdf.permissions` (virtual scope) into the concrete
 * capabilities it represents under the current PDF bit configuration:
 * {@link materializePdfPermissions}, the one reading of the bits.
 */
function addPdfPermissions(out: Set<DocCapability>, b: PdfBits): void {
  for (const capability of materializePdfPermissions(b)) out.add(capability);
}
