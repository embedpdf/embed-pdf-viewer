/**
 * The viewer's layout: where every bar, menu and panel goes, as plain data
 * ({@link LayoutData}), and the immutable value whose edits change it
 * ({@link Layout}). Every edit returns a new layout, so edits chain. An edit
 * that names an id the layout doesn't have changes nothing and records a
 * warning with the closest id that does exist; `validateLayout` returns those
 * warnings with the rest, so a typo never stops the viewer.
 *
 * Placing bars, drawing menus and opening panels is the viewer's job: a bar
 * reaches a toolbar through `compileBar` (layout-compile.ts).
 */
import type { Importance, Variant } from './schema';
import { didYouMean } from './suggestions';

// ── the data ─────────────────────────────────────────────────────────────────

/** An edge of the viewer. `start` and `end` follow the language: left and right, swapped in a right-to-left one. */
export type BarEdge = 'top' | 'bottom' | 'start' | 'end';

/** Where a floating bar sits over the pages. */
export type FloatPosition =
  | 'top-start'
  | 'top'
  | 'top-end'
  | 'start'
  | 'end'
  | 'bottom-start'
  | 'bottom'
  | 'bottom-end';

/** What a bar over a selection follows: selected text, or selected annotations. */
export type SelectionTarget = 'selection' | 'annotation';

/**
 * Where a bar goes: along an edge, floating over the pages, along another bar on the side of the
 * pages, over what's selected, or at the top of a panel, under its title. Bars on one edge stack
 * from the outside in, in the order they were added; `before` and `after` put a bar next to
 * another bar on that edge. A panel's bars stack in the order they were added.
 */
export type BarPlace =
  | BarEdge
  | { readonly edge: BarEdge; readonly before?: string; readonly after?: string }
  | { readonly float: FloatPosition }
  | { readonly with: string }
  | { readonly at: SelectionTarget }
  | { readonly panel: string };

/** A command with options. */
export interface LayoutCommandItem {
  readonly command: string;
  /** How it may show, richest first. Default `['icon']`. */
  readonly variants?: readonly Variant[];
  /** Who makes room first: `1` to `5` (never leaves the bar). Default: its group's. */
  readonly importance?: Importance;
}

/** Your own component, by its id. `command` is what it becomes in the "More" menu; without one, it never leaves the bar. */
export interface LayoutCustomItem {
  readonly custom: string;
  readonly command?: string;
  /** Your component's forms, largest first. Default `['default']`. */
  readonly variants?: readonly string[];
  /** Who makes room first, with a `command`. Default: its group's. */
  readonly importance?: Importance;
}

/** A command id, a command with options, or your own component. */
export type LayoutItem = string | LayoutCommandItem | LayoutCustomItem;

/** A group that needs a name or options. */
export interface LayoutGroupObject {
  /** Its name, so `add(item, { group })` can find it. */
  readonly id?: string;
  readonly items: readonly LayoutItem[];
  /** Fold into one button with a menu (`'menu'`) or a dropdown (`'select'`) when there's no room. */
  readonly collapse?: 'menu' | 'select';
  /** Move items behind a button inside the group before the group folds or leaves the bar. */
  readonly shed?: boolean;
  /** Who makes room first: `1` to `5`, for the group and each item without its own. Default `3`. */
  readonly importance?: Importance;
  /** Its title in the "More" menu, as a translation key. */
  readonly titleKey?: string;
  /**
   * Show only while something in the bar that isn't dependent shows, like undo and redo beside a
   * mode's tools. A bar with only dependent groups left is empty, and a mode's tab goes with it.
   */
  readonly dependent?: boolean;
}

/** A group of items, with a line between groups: an array, or an object when it needs a name or options. */
export type LayoutGroup = readonly LayoutItem[] | LayoutGroupObject;

/** A section of a bar: its groups in order. A lone item is a group of one. */
export type LayoutSection = readonly (LayoutGroup | LayoutItem)[];

/** A bar's sections: `start` (left), `center` and `end` (right); `start` and `end` swap in a right-to-left language. */
export type SectionName = 'start' | 'center' | 'end';

export interface LayoutBar {
  readonly place: BarPlace;
  /** Shown in this mode only. The mode gets a tab, titled by the bar's title, and a `mode:<mode>` command. */
  readonly mode?: string;
  readonly title?: string;
  /** The title as a translation key. */
  readonly titleKey?: string;
  readonly start?: LayoutSection;
  readonly center?: LayoutSection;
  readonly end?: LayoutSection;
}

/** A section of a menu: an array of command ids, or an object when it has a title. */
export type LayoutMenuSection =
  | readonly string[]
  | {
      readonly title?: string;
      /** The title as a translation key. */
      readonly titleKey?: string;
      readonly items: readonly string[];
    };

/** A menu: its sections, with a line between them. */
export type LayoutMenu = readonly LayoutMenuSection[];

/** How a panel opens: beside the pages, over them, or up from the bottom. */
export type PanelPresentation = 'dock' | 'overlay' | 'sheet';

/** How a panel opens at each of the viewer's sizes. A size left out opens the default way. */
export interface PanelPresentationBySize {
  readonly compact?: PanelPresentation;
  readonly medium?: PanelPresentation;
  readonly expanded?: PanelPresentation;
}

/** A panel's width: the one it starts at, and the narrowest and widest it can be dragged to. */
export interface PanelWidth {
  /** In px. Default `288`. */
  readonly initial?: number;
  /** In px. Default `200`. */
  readonly min?: number;
  /** In px. Default `640`. A docked panel never takes more than half the viewer. */
  readonly max?: number;
}

export interface LayoutPanel {
  /** Default `'end'`. */
  readonly side?: 'start' | 'end';
  readonly title?: string;
  /** The title as a translation key. */
  readonly titleKey?: string;
  /** Its button's icon. */
  readonly icon?: string;
  /**
   * How it opens: the same way at every size, or per size. Default
   * `{ compact: 'sheet', medium: 'overlay', expanded: 'dock' }`.
   */
  readonly present?: PanelPresentation | PanelPresentationBySize;
  /** Its width in px (where it starts), or where it starts and how far it drags. Default `288`. */
  readonly width?: number | PanelWidth;
  /** Whether people can drag its edge to change its width. Default `true`. */
  readonly resizable?: boolean;
}

/**
 * Changes to a panel: the fields to set. `present` and `width` change only what they name: a
 * map of sizes keeps the other sizes, and a number or `{ initial }` keeps `min` and `max`.
 */
export type LayoutPanelPatch = Partial<LayoutPanel>;

/** When the document tabs show: always, while more than one document is open, or never. */
export type TabsVisibility = 'always' | 'multiple' | 'never';

/** A layout as plain data: bars, menus and panels, each by id. */
export interface LayoutData {
  readonly bars?: Readonly<Record<string, LayoutBar>>;
  readonly menus?: Readonly<Record<string, LayoutMenu>>;
  readonly panels?: Readonly<Record<string, LayoutPanel>>;
  readonly tabs?: TabsVisibility;
}

// ── the layout ───────────────────────────────────────────────────────────────

/** Where {@link Layout.add} puts an item. */
export interface AddItemOptions {
  /** The bar or menu. A bar wins over a menu with the same id. */
  readonly to: string;
  /** The bar's section for a new group. Default `'end'`. */
  readonly section?: SectionName;
  /** The group to join, by id; a new id starts a new group at the end of the section. */
  readonly group?: string;
  /** An item to put it before, in that item's group. */
  readonly before?: string;
  /** An item to put it after, in that item's group. */
  readonly after?: string;
}

/** Where {@link Layout.remove} takes items from. */
export interface RemoveItemOptions {
  /** The bar or menu: always one place. To leave something out everywhere, turn it off instead. */
  readonly from: string;
}

/**
 * A layout: its data and the edits. Every edit returns a new layout and leaves this one as it
 * was; an edit that names an id the layout doesn't have changes nothing and records a warning.
 */
export interface Layout {
  /** Move a bar. */
  place(bar: string, place: BarPlace): Layout;
  /** Add a bar, or replace the bar with that id. */
  addBar(id: string, bar: LayoutBar): Layout;
  /** Remove a bar. Removing a mode's bar removes its tab. */
  removeBar(id: string): Layout;
  /** Put an item in a bar or a menu: at the end of a section, in a group, or next to an item. */
  add(item: LayoutItem, options: AddItemOptions): Layout;
  /** Take items out of one bar or menu; a group or section with nothing left goes with them. */
  remove(ids: string | readonly string[], options: RemoveItemOptions): Layout;
  /** Put another item in an item's place, in every bar and menu. */
  replace(id: string, item: LayoutItem): Layout;
  /** Add a menu, or replace the menu with that id. */
  addMenu(id: string, sections: LayoutMenu): Layout;
  /** Add a panel, or replace the panel with that id. */
  addPanel(id: string, panel: LayoutPanel): Layout;
  /** Change a panel's fields. */
  panel(id: string, changes: LayoutPanelPatch): Layout;
  /**
   * Change every panel's fields, as `panel(id, changes)` changes one: every panel the layout has
   * so far, so a panel added after it keeps its own.
   */
  panels(changes: LayoutPanelPatch): Layout;
  /** Remove a panel, and its `panel:<id>` button from every bar and menu. */
  removePanel(id: string): Layout;
  /** When the document tabs show. */
  tabs(visibility: TabsVisibility): Layout;
  /** The layout as plain data. */
  toJSON(): LayoutData;
}

interface LayoutState {
  readonly data: LayoutData;
  readonly warnings: readonly string[];
}

const states = new WeakMap<Layout, LayoutState>();

/** A layout of `data`, which it never changes. */
export function createLayout(data: LayoutData = {}): Layout {
  return layoutOf(data, []);
}

/** Whether `value` is a layout made by {@link createLayout} or one of its edits. */
export function isLayout(value: unknown): value is Layout {
  return typeof value === 'object' && value !== null && states.has(value as Layout);
}

/** What the edits that made `layout` couldn't do. */
export function layoutWarningsOf(layout: Layout): readonly string[] {
  return states.get(layout)?.warnings ?? [];
}

/** `layout` with one more warning. */
export function withLayoutWarning(layout: Layout, warning: string): Layout {
  const state = states.get(layout);
  return state ? layoutOf(state.data, [...state.warnings, warning]) : layout;
}

type Edited = readonly [LayoutData, readonly string[]];

function layoutOf(data: LayoutData, warnings: readonly string[]): Layout {
  const next = ([nextData, added]: Edited): Layout =>
    layoutOf(nextData, added.length > 0 ? [...warnings, ...added] : warnings);
  const layout: Layout = Object.freeze({
    place: (bar: string, place: BarPlace) => next(placeBar(data, bar, place)),
    addBar: (id: string, bar: LayoutBar) => next([withRecord(data, 'bars', id, bar), []]),
    removeBar: (id: string) => next(removeBar(data, id)),
    add: (item: LayoutItem, options: AddItemOptions) => next(addItem(data, item, options)),
    remove: (ids: string | readonly string[], options: RemoveItemOptions) =>
      next(removeItems(data, typeof ids === 'string' ? [ids] : ids, options)),
    replace: (id: string, item: LayoutItem) => next(replaceItem(data, id, item)),
    addMenu: (id: string, sections: LayoutMenu) =>
      next([withRecord(data, 'menus', id, sections), []]),
    addPanel: (id: string, panel: LayoutPanel) => next([withRecord(data, 'panels', id, panel), []]),
    panel: (id: string, changes: LayoutPanelPatch) => next(updatePanel(data, id, changes)),
    panels: (changes: LayoutPanelPatch) => next([updatePanels(data, changes), []]),
    removePanel: (id: string) => next(removePanel(data, id)),
    tabs: (visibility: TabsVisibility) => next([{ ...data, tabs: visibility }, []]),
    toJSON: () => data,
  });
  states.set(layout, { data, warnings });
  return layout;
}

// ── reading the data ─────────────────────────────────────────────────────────

export const SECTION_NAMES: readonly SectionName[] = ['start', 'center', 'end'];

/** One entry of a section: a group, or a lone item. */
export type SectionEntry = LayoutGroup | LayoutItem;

/** Whether a section entry is a group written as an object. */
export const isGroupObject = (entry: SectionEntry): entry is LayoutGroupObject =>
  typeof entry === 'object' && entry !== null && !Array.isArray(entry) && 'items' in entry;

/**
 * A bar section's entries; none for a section that isn't a list. Layout data comes from
 * people: what isn't the right shape is skipped here and named by `validateLayout`.
 */
export function entriesOf(bar: LayoutBar, name: SectionName): readonly SectionEntry[] {
  const entries: unknown = bar[name];
  return Array.isArray(entries) ? (entries as readonly SectionEntry[]) : [];
}

/** A section entry's items: a group's, or the lone item. */
export function itemsOfEntry(entry: SectionEntry): readonly LayoutItem[] {
  if (Array.isArray(entry)) return entry as readonly LayoutItem[];
  if (isGroupObject(entry)) return Array.isArray(entry.items) ? entry.items : [];
  return [entry as LayoutItem];
}

/** What an item is called in edits: its command id, your component's id, or `''` for a non-item. */
export function itemIdOf(item: LayoutItem): string {
  if (typeof item === 'string') return item;
  if (typeof item !== 'object' || item === null) return '';
  return 'custom' in item ? item.custom : item.command;
}

/** The command an item runs or stands for in menus, or `null` for your component without one. */
export function itemCommandOf(item: LayoutItem): string | null {
  if (typeof item === 'string') return item;
  if (typeof item !== 'object' || item === null) return null;
  return 'custom' in item ? (item.command ?? null) : item.command;
}

/** Whether `value` has an item's shape: a command id, `{ command }` or `{ custom }`. */
export function isLayoutItem(value: unknown): value is LayoutItem {
  if (typeof value === 'string') return value.length > 0;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const item = value as { command?: unknown; custom?: unknown };
  return typeof item.custom === 'string' || typeof item.command === 'string';
}

/** Every item id in a bar, in order, once each. */
export function itemIdsOfBar(bar: LayoutBar): string[] {
  const ids = new Set<string>();
  for (const name of SECTION_NAMES)
    for (const entry of entriesOf(bar, name))
      for (const item of itemsOfEntry(entry)) if (isLayoutItem(item)) ids.add(itemIdOf(item));
  return [...ids];
}

/** A menu section's items; none for a section that isn't one. */
export function itemsOfMenuSection(section: LayoutMenuSection): readonly string[] {
  if (Array.isArray(section)) return section as readonly string[];
  const items: unknown = (section as { items?: unknown } | null)?.items;
  return Array.isArray(items) ? (items as readonly string[]) : [];
}

/** A menu's sections; none for a menu that isn't a list. */
export const sectionsOfMenu = (menu: LayoutMenu): readonly LayoutMenuSection[] =>
  Array.isArray(menu) ? menu : [];

/** Every item in a menu, in order, once each. */
export const itemIdsOfMenu = (menu: LayoutMenu): string[] => [
  ...new Set(sectionsOfMenu(menu).flatMap((section) => itemsOfMenuSection(section))),
];

const barsOf = (data: LayoutData) => data.bars ?? {};
const menusOf = (data: LayoutData) => data.menus ?? {};
const panelsOf = (data: LayoutData) => data.panels ?? {};

function withRecord<Key extends 'bars' | 'menus' | 'panels'>(
  data: LayoutData,
  key: Key,
  id: string,
  value: NonNullable<LayoutData[Key]>[string],
): LayoutData {
  return { ...data, [key]: { ...data[key], [id]: value } };
}

function withoutRecord(data: LayoutData, key: 'bars' | 'menus' | 'panels', id: string): LayoutData {
  const { [id]: _removed, ...rest } = data[key] ?? {};
  return { ...data, [key]: rest };
}

/**
 * The entry with its items replaced: `null` when the edit took its last one, so the group goes.
 * A group that held none to begin with stays: the `modes` group, whose tabs are derived.
 */
function withEntryItems(entry: SectionEntry, items: readonly LayoutItem[]): SectionEntry | null {
  if (items.length === 0) return itemsOfEntry(entry).length === 0 ? entry : null;
  if (isGroupObject(entry)) return { ...entry, items };
  if (Array.isArray(entry)) return items;
  // A lone item that gained a neighbour becomes a group of its own.
  return items.length === 1 ? items[0]! : items;
}

/** The bar with each entry mapped; entries mapped to `null` and sections left empty go. */
function mapEntries(
  bar: LayoutBar,
  map: (entry: SectionEntry, section: SectionName, index: number) => SectionEntry | null,
): LayoutBar {
  const next: { -readonly [Name in SectionName]?: LayoutSection } = {};
  for (const name of SECTION_NAMES) {
    const entries = entriesOf(bar, name);
    if (entries.length === 0) continue;
    const mapped = entries
      .map((entry, index) => map(entry, name, index))
      .filter((entry): entry is SectionEntry => entry !== null);
    if (mapped.length > 0) next[name] = mapped;
  }
  const { start: _start, center: _center, end: _end, ...rest } = bar;
  return { ...rest, ...next };
}

function withMenuSectionItems(
  section: LayoutMenuSection,
  items: readonly string[],
): LayoutMenuSection | null {
  if (items.length === 0) return null;
  return Array.isArray(section) ? items : { ...(section as object), items };
}

const notFound = (verb: string, id: string, where: string, candidates: Iterable<string>) =>
  `${verb}: "${id}" is not in "${where}"${didYouMean(id, candidates)}`;

// ── the edits ────────────────────────────────────────────────────────────────

function placeBar(data: LayoutData, id: string, place: BarPlace): Edited {
  const bar = barsOf(data)[id];
  if (!bar) return [data, [`place: no bar "${id}"${didYouMean(id, Object.keys(barsOf(data)))}`]];
  return [withRecord(data, 'bars', id, { ...bar, place }), []];
}

function removeBar(data: LayoutData, id: string): Edited {
  if (!barsOf(data)[id])
    return [data, [`removeBar: no bar "${id}"${didYouMean(id, Object.keys(barsOf(data)))}`]];
  return [withoutRecord(data, 'bars', id), []];
}

function addItem(data: LayoutData, item: LayoutItem, options: AddItemOptions | undefined): Edited {
  if (!isLayoutItem(item)) return [data, [`add: ${JSON.stringify(item)} is not an item`]];
  const to = options?.to;
  if (!to) return [data, [`add: "${itemIdOf(item)}" needs a bar or menu to go to ({ to })`]];
  const bar = barsOf(data)[to];
  if (bar) return addToBar(data, to, bar, item, options);
  const menu = menusOf(data)[to];
  if (menu) return addToMenu(data, to, menu, item, options);
  const places = [...Object.keys(barsOf(data)), ...Object.keys(menusOf(data))];
  return [data, [`add: no bar or menu "${to}"${didYouMean(to, places)}`]];
}

function addToBar(
  data: LayoutData,
  barId: string,
  bar: LayoutBar,
  item: LayoutItem,
  options: AddItemOptions,
): Edited {
  const id = itemIdOf(item);
  const warnings: string[] = [];
  const twice = (items: readonly LayoutItem[]) => items.some((each) => itemIdOf(each) === id);
  const already = `add: "${id}" is already in that group of "${barId}"`;

  const anchor = options.before ?? options.after;
  if (anchor !== undefined) {
    for (const name of SECTION_NAMES) {
      const entries = entriesOf(bar, name);
      for (let index = 0; index < entries.length; index++) {
        const items = itemsOfEntry(entries[index]!);
        const at = items.findIndex((each) => itemIdOf(each) === anchor);
        if (at === -1) continue;
        if (twice(items)) return [data, [already]];
        const cut = options.before !== undefined ? at : at + 1;
        const nextItems = [...items.slice(0, cut), item, ...items.slice(cut)];
        const nextBar = mapEntries(bar, (entry, section, i) =>
          section === name && i === index ? withEntryItems(entry, nextItems) : entry,
        );
        return [withRecord(data, 'bars', barId, nextBar), []];
      }
    }
    // Not found: the item still goes in, where it would go without `before`/`after`.
    warnings.push(notFound('add', anchor, barId, itemIdsOfBar(bar)));
  }

  if (options.group !== undefined) {
    for (const name of SECTION_NAMES) {
      const entries = entriesOf(bar, name);
      const index = entries.findIndex(
        (entry) => isGroupObject(entry) && entry.id === options.group,
      );
      if (index === -1) continue;
      const items = itemsOfEntry(entries[index]!);
      if (twice(items)) return [data, [already]];
      const nextBar = mapEntries(bar, (entry, section, i) =>
        section === name && i === index ? withEntryItems(entry, [...items, item]) : entry,
      );
      return [withRecord(data, 'bars', barId, nextBar), warnings];
    }
  }

  let section = options.section ?? 'end';
  if (!SECTION_NAMES.includes(section)) {
    warnings.push(`add: "${section}" is not a section (start, center or end); using "end"`);
    section = 'end';
  }
  const entry: SectionEntry =
    options.group !== undefined ? { id: options.group, items: [item] } : [item];
  const nextBar: LayoutBar = { ...bar, [section]: [...entriesOf(bar, section), entry] };
  return [withRecord(data, 'bars', barId, nextBar), warnings];
}

function addToMenu(
  data: LayoutData,
  menuId: string,
  menu: LayoutMenu,
  item: LayoutItem,
  options: AddItemOptions,
): Edited {
  const command = typeof item === 'string' ? item : 'custom' in item ? null : item.command;
  if (command === null)
    return [data, [`add: "${menuId}" is a menu, which holds commands, not your own components`]];
  if (itemIdsOfMenu(menu).includes(command))
    return [data, [`add: "${command}" is already in "${menuId}"`]];

  const warnings: string[] = [];
  const anchor = options.before ?? options.after;
  if (anchor !== undefined) {
    const sections = sectionsOfMenu(menu);
    const index = sections.findIndex((section) => itemsOfMenuSection(section).includes(anchor));
    if (index !== -1) {
      const items = itemsOfMenuSection(sections[index]!);
      const at = items.indexOf(anchor);
      const cut = options.before !== undefined ? at : at + 1;
      const nextItems = [...items.slice(0, cut), command, ...items.slice(cut)];
      const nextMenu = sections.map((section, i) =>
        i === index ? withMenuSectionItems(section, nextItems)! : section,
      );
      return [withRecord(data, 'menus', menuId, nextMenu), []];
    }
    warnings.push(notFound('add', anchor, menuId, itemIdsOfMenu(menu)));
  }
  return [withRecord(data, 'menus', menuId, [...sectionsOfMenu(menu), [command]]), warnings];
}

function removeItems(
  data: LayoutData,
  ids: readonly string[],
  options: RemoveItemOptions | undefined,
): Edited {
  const from = options?.from;
  if (!from)
    return [
      data,
      [
        `remove: ${ids.map((id) => `"${id}"`).join(', ')} needs a bar or menu to come out of ({ from }); ` +
          'to leave something out everywhere, turn it off with `disable`',
      ],
    ];
  const gone = new Set(ids);
  const found = new Set<string>();
  const bar = barsOf(data)[from];
  if (bar) {
    const nextBar = mapEntries(bar, (entry) =>
      withEntryItems(
        entry,
        itemsOfEntry(entry).filter((each) => {
          const id = itemIdOf(each);
          if (!gone.has(id)) return true;
          found.add(id);
          return false;
        }),
      ),
    );
    const missing = ids.filter((id) => !found.has(id));
    return [
      found.size > 0 ? withRecord(data, 'bars', from, nextBar) : data,
      missing.map((id) => notFound('remove', id, from, itemIdsOfBar(bar))),
    ];
  }
  const menu = menusOf(data)[from];
  if (menu) {
    const nextMenu = sectionsOfMenu(menu)
      .map((section) =>
        withMenuSectionItems(
          section,
          itemsOfMenuSection(section).filter((id) => {
            if (!gone.has(id)) return true;
            found.add(id);
            return false;
          }),
        ),
      )
      .filter((section): section is LayoutMenuSection => section !== null);
    const missing = ids.filter((id) => !found.has(id));
    return [
      found.size > 0 ? withRecord(data, 'menus', from, nextMenu) : data,
      missing.map((id) => notFound('remove', id, from, itemIdsOfMenu(menu))),
    ];
  }
  const places = [...Object.keys(barsOf(data)), ...Object.keys(menusOf(data))];
  return [data, [`remove: no bar or menu "${from}"${didYouMean(from, places)}`]];
}

function replaceItem(data: LayoutData, id: string, item: LayoutItem): Edited {
  if (!isLayoutItem(item)) return [data, [`replace: ${JSON.stringify(item)} is not an item`]];
  let found = false;
  const bars: Record<string, LayoutBar> = {};
  for (const [barId, bar] of Object.entries(barsOf(data))) {
    if (!itemIdsOfBar(bar).includes(id)) {
      bars[barId] = bar;
      continue;
    }
    found = true;
    bars[barId] = mapEntries(bar, (entry) =>
      withEntryItems(
        entry,
        itemsOfEntry(entry).map((each) => (itemIdOf(each) === id ? item : each)),
      ),
    );
  }
  // A menu row is a command: your own component has no place there.
  const command = typeof item === 'string' ? item : 'custom' in item ? null : item.command;
  const menus: Record<string, LayoutMenu> = {};
  for (const [menuId, menu] of Object.entries(menusOf(data))) {
    if (command === null || !itemIdsOfMenu(menu).includes(id)) {
      menus[menuId] = menu;
      continue;
    }
    found = true;
    menus[menuId] = sectionsOfMenu(menu).map(
      (section) =>
        withMenuSectionItems(
          section,
          itemsOfMenuSection(section).map((each) => (each === id ? command : each)),
        )!,
    );
  }
  if (!found) {
    const everywhere = [
      ...Object.values(barsOf(data)).flatMap(itemIdsOfBar),
      ...Object.values(menusOf(data)).flatMap(itemIdsOfMenu),
    ];
    return [data, [`replace: "${id}" is in no bar or menu${didYouMean(id, everywhere)}`]];
  }
  return [{ ...data, bars, menus }, []];
}

/** A panel's `present` as a map of sizes: one way at every size, or the sizes it names. */
export const panelPresentationsOf = (
  present: PanelPresentation | PanelPresentationBySize,
): PanelPresentationBySize =>
  typeof present === 'string' ? { compact: present, medium: present, expanded: present } : present;

/** A panel's `width` as its fields: a number is where it starts. */
export const panelWidthFieldsOf = (width: number | PanelWidth): PanelWidth =>
  typeof width === 'number' ? { initial: width } : width;

/**
 * `panel` with `changes`: each field replaced, except `present` and `width`, which change only
 * what the change names (a map of sizes keeps the other sizes, `{ initial }` keeps the limits).
 */
function changedPanel(panel: LayoutPanel, changes: LayoutPanelPatch): LayoutPanel {
  const next: Record<string, unknown> = { ...panel };
  for (const [field, value] of Object.entries(changes)) {
    if (value !== undefined) next[field] = value;
  }
  const { present, width } = changes;
  if (typeof present === 'object' && panel.present !== undefined)
    next.present = { ...panelPresentationsOf(panel.present), ...present };
  if (
    width !== undefined &&
    panel.width !== undefined &&
    (typeof width === 'object' || typeof panel.width === 'object')
  )
    next.width = { ...panelWidthFieldsOf(panel.width), ...panelWidthFieldsOf(width) };
  return next as LayoutPanel;
}

function updatePanel(data: LayoutData, id: string, changes: LayoutPanelPatch): Edited {
  const panel = panelsOf(data)[id];
  if (!panel)
    return [data, [`panel: no panel "${id}"${didYouMean(id, Object.keys(panelsOf(data)))}`]];
  return [withRecord(data, 'panels', id, changedPanel(panel, changes)), []];
}

function updatePanels(data: LayoutData, changes: LayoutPanelPatch): LayoutData {
  const panels = Object.fromEntries(
    Object.entries(panelsOf(data)).map(([id, panel]) => [id, changedPanel(panel, changes)]),
  );
  return { ...data, panels };
}

function removePanel(data: LayoutData, id: string): Edited {
  if (!panelsOf(data)[id])
    return [data, [`removePanel: no panel "${id}"${didYouMean(id, Object.keys(panelsOf(data)))}`]];
  // Its button goes with it, from every bar and menu.
  const button = `panel:${id}`;
  const bars = Object.fromEntries(
    Object.entries(barsOf(data)).map(([barId, bar]) => [
      barId,
      itemIdsOfBar(bar).includes(button)
        ? mapEntries(bar, (entry) =>
            withEntryItems(
              entry,
              itemsOfEntry(entry).filter((each) => itemIdOf(each) !== button),
            ),
          )
        : bar,
    ]),
  );
  const menus = Object.fromEntries(
    Object.entries(menusOf(data)).map(([menuId, menu]) => [
      menuId,
      itemIdsOfMenu(menu).includes(button)
        ? sectionsOfMenu(menu)
            .map((section) =>
              withMenuSectionItems(
                section,
                itemsOfMenuSection(section).filter((each) => each !== button),
              ),
            )
            .filter((section): section is LayoutMenuSection => section !== null)
        : menu,
    ]),
  );
  return [{ ...withoutRecord(data, 'panels', id), bars, menus }, []];
}

// ── the viewer's size ────────────────────────────────────────────────────────

/** The viewer's size class, from its own width. */
export type ViewerSize = 'compact' | 'medium' | 'expanded';

/** What the layout function knows about the viewer, measured on the viewer itself. */
export interface LayoutEnv {
  /** `'compact'` under 600 px, `'medium'` to 1023 px, `'expanded'` from 1024 px. */
  readonly size: ViewerSize;
  /** The viewer's width, in px. */
  readonly width: number;
  /** Whether the main way of pointing is a finger. */
  readonly touch: boolean;
  /** How the user's language reads. */
  readonly dir: 'ltr' | 'rtl';
}

/** The narrowest a medium viewer is, in px. */
export const MEDIUM_MIN_WIDTH_PX = 600;
/** The narrowest an expanded viewer is, in px. */
export const EXPANDED_MIN_WIDTH_PX = 1024;

/** The size class of a viewer this wide. */
export function sizeOf(widthPx: number): ViewerSize {
  if (widthPx < MEDIUM_MIN_WIDTH_PX) return 'compact';
  return widthPx < EXPANDED_MIN_WIDTH_PX ? 'medium' : 'expanded';
}

/** Whether two envs are the same: the layout function runs again only when one of the fields changes. */
export const sameLayoutEnv = (left: LayoutEnv, right: LayoutEnv): boolean =>
  left.size === right.size &&
  left.width === right.width &&
  left.touch === right.touch &&
  left.dir === right.dir;

// ── the layout option ────────────────────────────────────────────────────────

/** Gets the default layout and the viewer's env, and returns your layout. */
export type LayoutFunction = (layout: Layout, env: LayoutEnv) => Layout | LayoutData;

/** What the `layout` config takes: a layout, plain layout data, or a function of the default. */
export type LayoutOption = Layout | LayoutData | LayoutFunction;

/**
 * The layout an option gives at this env: the default without one, the function's result, or
 * the option itself. A function that throws or returns no layout gives the default, with a
 * warning saying so.
 */
export function resolveLayout(
  option: LayoutOption | null | undefined,
  defaults: Layout,
  env: LayoutEnv,
): Layout {
  if (option === undefined || option === null) return defaults;
  if (typeof option === 'function') {
    let result: unknown;
    try {
      result = option(defaults, env);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return withLayoutWarning(
        defaults,
        `the layout function threw (${message}); showing the default layout`,
      );
    }
    return toLayout(result, defaults, 'the layout function returned');
  }
  return toLayout(option, defaults, 'layout is');
}

function toLayout(value: unknown, defaults: Layout, what: string): Layout {
  if (isLayout(value)) return value;
  if (typeof value === 'object' && value !== null && !Array.isArray(value))
    return createLayout(value as LayoutData);
  return withLayoutWarning(
    defaults,
    `${what} ${value === undefined ? 'nothing' : typeof value}, not a layout; showing the default layout`,
  );
}
