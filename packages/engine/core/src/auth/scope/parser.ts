import { InvalidScope } from './errors';
import type { CollabAction, CollabFilter, DocCapability, FieldAction, ParsedScope } from './types';

/**
 * Closed set of recognized capability strings. Membership is the
 * authoritative source of truth — adding a new capability requires
 * extending the `DocCapability` union and adding it here. The parser
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
  'doc.forms.import',
  'doc.forms.script',
  'doc.forms.submit',
  'doc.annotate.read',
  'doc.annotate.modify',
  'doc.annotate.import',
  'doc.metadata.modify',
  'doc.attachments.modify',
  'doc.outline.modify',
  'doc.redact',
  'doc.sign',
  'doc.sign.certify',
]);

/**
 * Parse a single scope string into a structured `ParsedScope`.
 *
 * Recognised shapes:
 *   - `"*"`                              → wildcard
 *   - `"pdf.permissions"`                → virtual (expands at resolve time)
 *   - `"doc.a.b"` (dotted, core namespace) → capability
 *   - `"plugin-id.action"` (dotted, any other first segment) → plugin permission
 *   - `"entity:action:filter"` (colons)  → collab
 *
 * Throws {@link InvalidScope} for any string that fails to match one of
 * those shapes, or whose capability/entity/action/filter is not in the
 * closed enum. A plugin permission only has to be well formed: whether its
 * plugin is installed is the server's question, asked where people grant it.
 */
export function parseScope(raw: string): ParsedScope {
  if (raw === '*') return { kind: 'wildcard' };
  if (raw === 'pdf.permissions') return { kind: 'virtual', name: 'pdf.permissions' };
  if (raw.includes(':')) return parseCollab(raw);
  const plugin = pluginOfPermission(raw);
  if (plugin !== null) return parsePluginPermission(raw, plugin);
  return parseCapability(raw);
}

/**
 * The first segments the core owns, across every vocabulary a plugin shares
 * with it. Permissions: document capabilities (`doc.*`), the virtual
 * `pdf.permissions`, the collab entities, and the tenant scopes
 * (`docs.read`, `tokens.issue-doc`, `grants.manage`). Events: `layer.changed`,
 * `visitor.identified`, `document.ready`, `submission.created`,
 * `signature.completed`. A plugin id can never be one of these, so a dotted
 * word that starts with one is the core's, and must be a word the core knows.
 */
export const CORE_NAMESPACES: ReadonlySet<string> = new Set([
  'doc',
  'docs',
  'pdf',
  'annotations',
  'fields',
  'tokens',
  'grants',
  'shares',
  'tenants',
  'layer',
  'visitor',
  'document',
  'submission',
  'signature',
]);

/**
 * The plugin a permission belongs to: its first segment, when the word is
 * dotted and that segment isn't one of the core's namespaces. Null for
 * every core word (and for anything that isn't dotted).
 */
export function pluginOfPermission(raw: string): string | null {
  if (raw.includes(':')) return null;
  const dot = raw.indexOf('.');
  if (dot <= 0) return null;
  const namespace = raw.slice(0, dot);
  return CORE_NAMESPACES.has(namespace) ? null : namespace;
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
  // Split on the first two colons only. Filter values may contain
  // colons (UUIDs with `urn:uuid:...`, subject ids like `auth0|user:1`).
  const idx1 = raw.indexOf(':');
  const idx2 = raw.indexOf(':', idx1 + 1);
  if (idx1 === -1 || idx2 === -1) {
    throw new InvalidScope(raw, 'collab scope requires entity:action:filter');
  }
  const entity = raw.slice(0, idx1);
  const action = raw.slice(idx1 + 1, idx2);
  const filterStr = raw.slice(idx2 + 1);

  if (entity === 'fields') return parseFieldScope(raw, action, filterStr);
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

/**
 * `fields:<fill|sign|set-group|*>:<all|group=NAME>`. A field's group is who
 * fills it, and a field records no creator, so `self` and `createdBy=` are
 * refused.
 */
function parseFieldScope(raw: string, action: string, filterStr: string): ParsedScope {
  if (action !== 'fill' && action !== 'sign' && action !== 'set-group' && action !== '*') {
    throw new InvalidScope(raw, `unknown fields action: ${action}`);
  }
  const filter = parseFilter(filterStr, raw);
  if (filter.kind !== 'all' && filter.kind !== 'group') {
    throw new InvalidScope(
      raw,
      `fields only support :all or :group=<id> filters (got :${filter.kind})`,
    );
  }
  return { kind: 'collab', entity: 'fields', action: action as FieldAction | '*', filter };
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

/** A plugin id (lowercase words joined by dashes), then one or more dotted actions of the same form. */
const PLUGIN_PERMISSION_SHAPE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*(\.[a-z][a-z0-9]*(-[a-z0-9]+)*)+$/;

function parsePluginPermission(raw: string, plugin: string): ParsedScope {
  if (!PLUGIN_PERMISSION_SHAPE.test(raw)) {
    throw new InvalidScope(raw, 'invalid plugin permission shape (expected <plugin id>.<action>)');
  }
  return { kind: 'plugin', name: raw, plugin };
}

function parseCapability(raw: string): ParsedScope {
  if (!CAPABILITY_SHAPE.test(raw)) {
    throw new InvalidScope(raw, 'invalid capability name shape');
  }
  if (!KNOWN_CAPABILITIES.has(raw as DocCapability)) {
    throw new InvalidScope(raw, `unknown capability: ${raw}`);
  }
  return { kind: 'capability', name: raw as DocCapability };
}
