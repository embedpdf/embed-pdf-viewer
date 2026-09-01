import { InvalidScope } from './errors';
import type { CollabAction, CollabFilter, DocCapability, ParsedScope } from './types';

/**
 * Closed set of recognized capability strings. Membership is the
 * authoritative source of truth — adding a new capability requires
 * extending the `DocCapability` union AND adding it here. The parser
 * rejects anything outside this set.
 *
 * Removed legacy names (e.g., `doc.read`, `doc.edit-pages`, `doc.save`)
 * are deliberately absent so any JWT carrying them fails at verify
 * time with a clear error.
 */
const KNOWN_CAPABILITIES: ReadonlySet<DocCapability> = new Set([
  'doc.open',
  'doc.render',
  'doc.text.select',
  'doc.text.copy',
  'doc.text.search',
  'doc.content.copy',
  'doc.download',
  'doc.download.flattened',
  'doc.print',
  'doc.print.high',
  'doc.pages.modify',
  'doc.pages.assemble',
  'doc.forms.read',
  'doc.forms.fill',
  'doc.forms.modify',
  'doc.forms.submit',
  'doc.annotate.read',
  'doc.annotate.modify',
  'doc.metadata.modify',
  'doc.attachments.modify',
  'doc.redact',
]);

/**
 * Parse a single scope string into a structured `ParsedScope`.
 *
 * Recognised shapes:
 *   - `"*"`                              → wildcard
 *   - `"pdf.permissions"`                → virtual (expands at resolve time)
 *   - `"a.b.c..."` (dotted)              → capability
 *   - `"entity:action:filter"` (colons)  → collab
 *
 * Throws {@link InvalidScope} for any string that fails to match one of
 * those shapes, or whose capability/entity/action/filter is not in the
 * closed enum.
 */
export function parseScope(raw: string): ParsedScope {
  if (raw === '*') return { kind: 'wildcard' };
  if (raw === 'pdf.permissions') return { kind: 'virtual', name: 'pdf.permissions' };
  if (raw.includes(':')) return parseCollab(raw);
  return parseCapability(raw);
}

/**
 * Validate every entry in a scope array by attempting to parse it.
 * Throws on the first invalid string. Discards the parse output —
 * callers re-parse at resolution time to keep the array as the
 * authoritative payload.
 */
export function validateScopeArray(raw: ReadonlyArray<string>): void {
  for (const s of raw) parseScope(s);
}

function parseCollab(raw: string): ParsedScope {
  // Split on the FIRST two colons only. Filter values may contain
  // colons (UUIDs with `urn:uuid:...`, subject ids like `auth0|user:1`).
  const idx1 = raw.indexOf(':');
  const idx2 = raw.indexOf(':', idx1 + 1);
  if (idx1 === -1 || idx2 === -1) {
    throw new InvalidScope(raw, 'collab scope requires entity:action:filter');
  }
  const entity = raw.slice(0, idx1);
  const action = raw.slice(idx1 + 1, idx2);
  const filterStr = raw.slice(idx2 + 1);

  if (entity !== 'annotations') {
    throw new InvalidScope(raw, `unknown collab entity: ${entity}`);
  }
  if (
    action !== 'create' &&
    action !== 'update' &&
    action !== 'delete' &&
    action !== 'set-group' &&
    action !== '*'
  ) {
    throw new InvalidScope(raw, `unknown collab action: ${action}`);
  }
  const filter = parseFilter(filterStr, raw);

  // `set-group` is a group-assignment authority, not a per-record collab
  // filter. The only meaningful filter values are `all` (assign to any
  // group) and `group=X` (assign to group X). `:self` and `:createdBy=Y`
  // can't be sensibly applied to "what group is this annotation in", so
  // we reject them at parse time rather than silently always-denying.
  if (action === 'set-group' && (filter.kind === 'self' || filter.kind === 'createdBy')) {
    throw new InvalidScope(
      raw,
      `set-group only supports :all or :group=<id> filters (got :${filter.kind})`,
    );
  }

  return {
    kind: 'collab',
    entity,
    action: action as CollabAction | '*',
    filter,
  };
}

function parseFilter(s: string, raw: string): CollabFilter {
  if (s === 'all') return { kind: 'all' };
  if (s === 'self') return { kind: 'self' };
  if (s.startsWith('createdBy=')) {
    const v = s.slice('createdBy='.length);
    if (!v) throw new InvalidScope(raw, 'createdBy= requires a value');
    return { kind: 'createdBy', userId: v };
  }
  if (s.startsWith('group=')) {
    const v = s.slice('group='.length);
    if (!v) throw new InvalidScope(raw, 'group= requires a value');
    return { kind: 'group', groupId: v };
  }
  throw new InvalidScope(raw, `unknown filter: ${s}`);
}

// Capability shape: lowercase dotted segments, e.g. "doc.text.copy".
// Validates shape first, then membership in the closed set.
const CAPABILITY_SHAPE = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;

function parseCapability(raw: string): ParsedScope {
  if (!CAPABILITY_SHAPE.test(raw)) {
    throw new InvalidScope(raw, 'invalid capability name shape');
  }
  if (!KNOWN_CAPABILITIES.has(raw as DocCapability)) {
    throw new InvalidScope(raw, `unknown capability: ${raw}`);
  }
  return { kind: 'capability', name: raw as DocCapability };
}
