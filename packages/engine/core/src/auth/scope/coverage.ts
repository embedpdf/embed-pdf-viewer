import { parseScope } from './parser';
import { expandedCapabilities } from './resolver';
import type { CollabFilter, DocCapability, ParsedScope, PdfBits } from './types';

/**
 * What `wanted` would allow that `held` doesn't, in scope words; empty when
 * `held` covers it. The rule for handing out document permissions, in a doc
 * token or a grant: you give only what you hold.
 *
 * `held` covers `wanted` when, on every document, everything `wanted` allows
 * `held` allows too. `pdf.permissions` reads the file's permission bits, so
 * both sides are compared under every combination of them. Per entry:
 *
 * - `*` is covered only by `*`, which covers everything.
 * - A capability is covered by itself, or by one that implies it
 *   (`doc.render` covers `doc.render.thumbnail`).
 * - `pdf.permissions` is covered by `pdf.permissions`, or by holding
 *   everything it can give on any file.
 * - A collab write (`annotations:update:group=legal`) is covered when `held`
 *   may take that action on those records: through `doc.annotate.modify`
 *   (or `doc.forms.fill`, `doc.sign`) where no collab scope of its own narrows
 *   the action, or through a collab scope whose filter covers it. `:all`
 *   covers every filter, and `group=` and `createdBy=` cover the same value.
 *   `:self` covers only `create:self`: anywhere else it means the holder's
 *   own records, which aren't the other person's.
 * - A plugin permission is covered by itself.
 */
export function scopeNotCovered(
  wanted: ReadonlyArray<string>,
  held: ReadonlyArray<string>,
): string[] {
  const heldParsed = held.map(parseScope);
  if (heldParsed.some((s) => s.kind === 'wildcard')) return [];
  const wantedParsed = wanted.map(parseScope);
  if (wantedParsed.some((s) => s.kind === 'wildcard')) return ['*'];

  const readsTheFile = [...heldParsed, ...wantedParsed].some((s) => s.kind === 'virtual');
  const beyond = new Set<string>();
  for (const bits of readsTheFile ? EVERY_PDF_BITS : [NO_PDF_BITS]) {
    const mine = authorityOf(heldParsed, bits);
    const theirs = authorityOf(wantedParsed, bits);
    for (const capability of theirs.capabilities) {
      if (!mine.capabilities.has(capability)) beyond.add(capability);
    }
    for (const [write, filters] of theirs.writes) {
      const mineFilters = mine.writes.get(write) ?? [];
      for (const filter of filters) {
        if (!mineFilters.some((m) => filterCovers(m, filter, write))) {
          beyond.add(`${write}:${filterWord(filter)}`);
        }
      }
    }
    for (const permission of theirs.plugins) {
      if (!mine.plugins.has(permission)) beyond.add(permission);
    }
  }
  return [...beyond].sort();
}

/** What a scope allows on a file with these bits, in the three shapes {@link scopeNotCovered} compares. */
interface Authority {
  capabilities: Set<DocCapability>;
  /** Per collab write (`annotations:update`), the records it reaches, as filters. */
  writes: Map<string, CollabFilter[]>;
  plugins: Set<string>;
}

/**
 * The collab writes, each with the capability that allows it on every record
 * when no collab scope narrows it. Putting a record in a group has none:
 * only a `set-group` scope (or `*`) allows it.
 */
const WRITES: ReadonlyArray<{
  entity: 'annotations' | 'fields';
  action: string;
  broad: DocCapability | null;
}> = [
  { entity: 'annotations', action: 'create', broad: 'doc.annotate.modify' },
  { entity: 'annotations', action: 'update', broad: 'doc.annotate.modify' },
  { entity: 'annotations', action: 'delete', broad: 'doc.annotate.modify' },
  { entity: 'annotations', action: 'set-group', broad: null },
  { entity: 'fields', action: 'fill', broad: 'doc.forms.fill' },
  { entity: 'fields', action: 'sign', broad: 'doc.sign' },
  { entity: 'fields', action: 'set-group', broad: null },
];

const ALL: CollabFilter = { kind: 'all' };

function authorityOf(parsed: ReadonlyArray<ParsedScope>, bits: PdfBits): Authority {
  const capabilities = expandedCapabilities(parsed, bits);
  const writes = new Map<string, CollabFilter[]>();
  for (const { entity, action, broad } of WRITES) {
    // The same narrowing as checkCollab and checkFieldAction: a collab
    // scope for the action decides alone, else the broad capability.
    const narrowing = parsed.flatMap((s) =>
      s.kind === 'collab' && s.entity === entity && (s.action === action || s.action === '*')
        ? [s.filter]
        : [],
    );
    // `:self` and `createdBy=` mean nothing to set-group (checkSetGroup skips them).
    const filters =
      action === 'set-group'
        ? narrowing.filter((f) => f.kind === 'all' || f.kind === 'group')
        : narrowing.length > 0
          ? narrowing
          : broad !== null && capabilities.has(broad)
            ? [ALL]
            : [];
    if (filters.length > 0) writes.set(`${entity}:${action}`, filters);
  }
  const plugins = new Set(parsed.flatMap((s) => (s.kind === 'plugin' ? [s.name] : [])));
  return { capabilities, writes, plugins };
}

function filterCovers(mine: CollabFilter, theirs: CollabFilter, write: string): boolean {
  switch (mine.kind) {
    case 'all':
      return true;
    case 'group':
      return theirs.kind === 'group' && theirs.groupId === mine.groupId;
    case 'createdBy':
      return theirs.kind === 'createdBy' && theirs.userId === mine.userId;
    case 'self':
      // A create is checked against the creator, so `create:self` means the
      // same for whoever holds it.
      return theirs.kind === 'self' && write === 'annotations:create';
  }
}

function filterWord(filter: CollabFilter): string {
  switch (filter.kind) {
    case 'all':
    case 'self':
      return filter.kind;
    case 'createdBy':
      return `createdBy=${filter.userId}`;
    case 'group':
      return `group=${filter.groupId}`;
  }
}

const NO_PDF_BITS: PdfBits = {
  bit3: false,
  bit4: false,
  bit5: false,
  bit6: false,
  bit9: false,
  bit10: false,
  bit11: false,
  bit12: false,
};

/** Every combination of the bits `pdf.permissions` reads (bit 10 gives nothing). */
const EVERY_PDF_BITS: ReadonlyArray<PdfBits> = Array.from({ length: 1 << 7 }, (_, n) => ({
  bit3: (n & 1) !== 0,
  bit4: (n & 2) !== 0,
  bit5: (n & 4) !== 0,
  bit6: (n & 8) !== 0,
  bit9: (n & 16) !== 0,
  bit10: false,
  bit11: (n & 32) !== 0,
  bit12: (n & 64) !== 0,
}));
