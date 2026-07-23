/**
 * Pure transforms over ChromeSchema — the "surgical edit" tier of the
 * customization ladder, between "pass nothing" and "own the whole value".
 * They are ordinary functions over data: no registry, no merge grammar, no
 * order sensitivity beyond function composition. Anything they can't express
 * is a sign the caller should write the schema value instead.
 *
 * Addressing is by BAR ID across all three bar collections (bars, modeBars,
 * strips). Mode bars may also be addressed by their surface key
 * ('mode:annotate') since that is what appears in `chrome.modeBars`.
 */
import {
  group as makeGroup,
  type BarChild,
  type BarGroup,
  type BarSchema,
  type BarSections,
  type ChromeSchema,
  type CustomItem,
} from './schema';

export interface AddItemSpec {
  /** Bar id ('main', 'annotate', …) or a modeBars surface key ('mode:annotate'). */
  readonly bar: string;
  readonly section: keyof BarSections;
  /** Target group id. Unknown in the bar → a new group is created at the end
   *  of `section`; known but in a DIFFERENT section → error (group ids are
   *  bar-unique, so that is a contradiction, not a request). */
  readonly group: string;
  readonly item: BarChild;
  /** Insert position within the group. Default: append. */
  readonly at?: number;
}

const SECTION_NAMES: readonly (keyof BarSections)[] = ['start', 'center', 'end'];

const isCustom = (child: BarChild): child is CustomItem =>
  typeof child !== 'string' && 'slot' in child;

const commandOf = (child: BarChild): string | null =>
  typeof child === 'string' ? child : isCustom(child) ? null : child.command;

/** Every (collection, key) location whose bar matches `id`. */
function locate(schema: ChromeSchema, id: string): ['bars' | 'modeBars' | 'strips', string][] {
  const hits: ['bars' | 'modeBars' | 'strips', string][] = [];
  for (const coll of ['bars', 'modeBars', 'strips'] as const) {
    for (const [key, bar] of Object.entries(schema[coll] ?? {})) {
      if (bar.id === id || key === id) hits.push([coll, key]);
    }
  }
  return hits;
}

function withBar(
  schema: ChromeSchema,
  coll: 'bars' | 'modeBars' | 'strips',
  key: string,
  bar: BarSchema,
): ChromeSchema {
  return { ...schema, [coll]: { ...schema[coll], [key]: bar } };
}

/** Insert `spec.item` into a group of one bar. See AddItemSpec for semantics. */
export function addItem(schema: ChromeSchema, spec: AddItemSpec): ChromeSchema {
  const hits = locate(schema, spec.bar);
  if (hits.length === 0)
    throw new Error(`[ui-core] addItem: no bar "${spec.bar}" in bars/modeBars/strips`);
  if (hits.length > 1)
    throw new Error(
      `[ui-core] addItem: bar id "${spec.bar}" is ambiguous (${hits.map(([c]) => c).join(', ')})`,
    );
  const [coll, key] = hits[0];
  const bar = schema[coll]![key];

  for (const name of SECTION_NAMES) {
    if (name === spec.section) continue;
    if (bar.sections[name]?.some((g) => g.id === spec.group))
      throw new Error(
        `[ui-core] addItem: group "${spec.group}" lives in section "${name}", not "${spec.section}"`,
      );
  }

  const groups = bar.sections[spec.section] ?? [];
  const idx = groups.findIndex((g) => g.id === spec.group);
  const nextGroups =
    idx === -1
      ? [...groups, makeGroup(spec.group, [spec.item])]
      : groups.map((g, i) => {
          if (i !== idx) return g;
          const items = [...g.items];
          items.splice(spec.at ?? items.length, 0, spec.item);
          return { ...g, items };
        });

  return withBar(schema, coll, key, {
    ...bar,
    sections: { ...bar.sections, [spec.section]: nextGroups },
  });
}

/**
 * Purge commands (or custom slots, by slot name) from every bar, mode bar,
 * strip, and menu. Groups and menu sections that empty out are dropped;
 * emptied menus keep their key (commands may still target them) with no rows.
 */
export function removeItems(schema: ChromeSchema, ids: readonly string[]): ChromeSchema {
  const gone = new Set(ids);
  const keep = (child: BarChild): boolean => {
    const cmd = commandOf(child);
    return cmd !== null ? !gone.has(cmd) : !gone.has((child as CustomItem).slot);
  };

  const filterGroups = (groups: readonly BarGroup[] | undefined) =>
    groups?.map((g) => ({ ...g, items: g.items.filter(keep) })).filter((g) => g.items.length > 0);

  const filterBarSchema = (bar: BarSchema): BarSchema => ({
    ...bar,
    sections: Object.fromEntries(
      SECTION_NAMES.flatMap((name) => {
        const groups = filterGroups(bar.sections[name]);
        return groups && groups.length > 0 ? [[name, groups]] : [];
      }),
    ),
  });

  const filterColl = <T extends Readonly<Record<string, BarSchema>> | undefined>(coll: T): T =>
    coll &&
    (Object.fromEntries(Object.entries(coll).map(([k, b]) => [k, filterBarSchema(b)])) as T);

  return {
    ...schema,
    bars: filterColl(schema.bars)!,
    modeBars: filterColl(schema.modeBars),
    strips: filterColl(schema.strips),
    menus:
      schema.menus &&
      Object.fromEntries(
        Object.entries(schema.menus).map(([k, menu]) => [
          k,
          {
            ...menu,
            sections: menu.sections
              .map((s) => ({ ...s, items: s.items.filter((c) => !gone.has(c)) }))
              .filter((s) => s.items.length > 0),
          },
        ]),
      ),
  };
}

/**
 * Swap a command in place everywhere it appears — bars, mode bars, strips,
 * and (when the replacement is itself a plain command) menu rows.
 */
export function replaceItem(schema: ChromeSchema, id: string, item: BarChild): ChromeSchema {
  const replacementCommand = commandOf(item);
  const swap = (child: BarChild): BarChild => (commandOf(child) === id ? item : child);

  const mapBar = (bar: BarSchema): BarSchema => ({
    ...bar,
    sections: Object.fromEntries(
      SECTION_NAMES.flatMap((name) => {
        const groups = bar.sections[name];
        return groups ? [[name, groups.map((g) => ({ ...g, items: g.items.map(swap) }))]] : [];
      }),
    ),
  });

  const mapColl = <T extends Readonly<Record<string, BarSchema>> | undefined>(coll: T): T =>
    coll && (Object.fromEntries(Object.entries(coll).map(([k, b]) => [k, mapBar(b)])) as T);

  return {
    ...schema,
    bars: mapColl(schema.bars)!,
    modeBars: mapColl(schema.modeBars),
    strips: mapColl(schema.strips),
    menus:
      replacementCommand === null
        ? schema.menus
        : schema.menus &&
          Object.fromEntries(
            Object.entries(schema.menus).map(([k, menu]) => [
              k,
              {
                ...menu,
                sections: menu.sections.map((s) => ({
                  ...s,
                  items: s.items.map((c) => (c === id ? replacementCommand : c)),
                })),
              },
            ]),
          ),
  };
}
