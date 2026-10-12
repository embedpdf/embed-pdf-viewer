/**
 * A layout read the way the viewer places it: the bars on an edge in their
 * order, the bars that ride along another bar or follow a selection, the modes
 * and their tabs, the menus' sections, and each bar as the {@link BarSchema} a
 * toolbar fits.
 *
 * The mode tabs are derived, never written: the group with id `modes` lists
 * View, then one tab per mode of the layout's bars, in bar order, before any
 * items of its own.
 */
import type {
  BarEdge,
  BarPlace,
  LayoutBar,
  LayoutData,
  LayoutItem,
  LayoutMenuSection,
  SectionName,
  SelectionTarget,
} from './layout';
import {
  SECTION_NAMES,
  entriesOf,
  isGroupObject,
  isLayoutItem,
  itemIdOf,
  itemsOfEntry,
  itemsOfMenuSection,
  sectionsOfMenu,
} from './layout';
import type {
  BarChild,
  BarGroup,
  BarItem,
  BarSchema,
  BarSections,
  CustomItem,
  NormalizedBar,
} from './schema';
import { commandOfUnit, hasVisibleUnits, normalizeBar } from './schema';

/** The id of the group that holds the mode tabs. */
export const MODES_GROUP = 'modes';

/** The command of the mode with no bar of its own: viewing. */
export const VIEW_MODE_COMMAND = 'mode:view';

/** The command that opens a mode, and its tab. */
export const modeCommandOf = (mode: string): string => `mode:${mode}`;

/** The command that opens and closes a panel, and its button. */
export const panelCommandOf = (panel: string): string => `panel:${panel}`;

const EDGES: readonly BarEdge[] = ['top', 'bottom', 'start', 'end'];

/** The layout's bars, by id, in order: the ones that are objects (`validateLayout` names the rest). */
const barsOf = (data: LayoutData): [string, LayoutBar][] =>
  Object.entries(data.bars ?? {}).filter(
    (entry): entry is [string, LayoutBar] => typeof entry[1] === 'object' && entry[1] !== null,
  );

/** The edge a place is on, or `null` for a place that isn't an edge. */
export function edgeOf(place: BarPlace | undefined): BarEdge | null {
  if (typeof place === 'string') return EDGES.includes(place) ? place : null;
  if (typeof place === 'object' && place !== null && 'edge' in place)
    return EDGES.includes(place.edge) ? place.edge : null;
  return null;
}

/** The bar a place rides along, or `null`. */
export function hostOf(place: BarPlace | undefined): string | null {
  return typeof place === 'object' && place !== null && 'with' in place ? place.with : null;
}

/** What a place follows when it is over a selection, or `null`. */
export function selectionOf(place: BarPlace | undefined): SelectionTarget | null {
  return typeof place === 'object' && place !== null && 'at' in place ? place.at : null;
}

/**
 * The bars along an edge, from the outside in: in the order they were added, then each bar
 * with `before` or `after` put next to the bar it names. A bar that names a bar not on this
 * edge goes innermost.
 */
export function barsOnEdge(data: LayoutData, edge: BarEdge): string[] {
  const placed = barsOf(data).filter(([, bar]) => edgeOf(bar.place) === edge);
  const anchorOf = (place: BarPlace) =>
    typeof place === 'object' && place !== null && 'edge' in place
      ? place.before !== undefined
        ? { id: place.before, after: false }
        : place.after !== undefined
          ? { id: place.after, after: true }
          : null
      : null;
  const stack = placed.filter(([, bar]) => anchorOf(bar.place) === null).map(([id]) => id);
  let pending = placed.filter(([, bar]) => anchorOf(bar.place) !== null);
  // Anchors may name bars that are themselves anchored: place what can be placed, again.
  for (let placedOne = true; placedOne && pending.length > 0; ) {
    placedOne = false;
    pending = pending.filter(([id, bar]) => {
      const anchor = anchorOf(bar.place)!;
      const index = stack.indexOf(anchor.id);
      if (index === -1) return true;
      stack.splice(anchor.after ? index + 1 : index, 0, id);
      placedOne = true;
      return false;
    });
  }
  return [...stack, ...pending.map(([id]) => id)];
}

/** The bars that ride along `host`, in the order they were added, nearest first. */
export function barsWith(data: LayoutData, host: string): string[] {
  return barsOf(data)
    .filter(([, bar]) => hostOf(bar.place) === host)
    .map(([id]) => id);
}

/**
 * Every bar drawn along an edge, from the outside in: each bar on the edge, followed by the bars
 * that ride along it (nearest first) and the bars that ride along those.
 */
export function edgeStackOf(data: LayoutData, edge: BarEdge): string[] {
  const stack: string[] = [];
  const visit = (id: string) => {
    if (stack.includes(id)) return;
    stack.push(id);
    for (const rider of barsWith(data, id)) visit(rider);
  };
  for (const id of barsOnEdge(data, edge)) visit(id);
  return stack;
}

/** The bars over a selection of this kind, in the order they were added. */
export function barsAt(data: LayoutData, target: SelectionTarget): string[] {
  return barsOf(data)
    .filter(([, bar]) => selectionOf(bar.place) === target)
    .map(([id]) => id);
}

/** Every mode of the layout's bars, once each, in bar order. */
export function modesOf(data: LayoutData): string[] {
  const modes = new Set<string>();
  for (const [, bar] of barsOf(data))
    if (typeof bar.mode === 'string' && bar.mode.length > 0) modes.add(bar.mode);
  return [...modes];
}

/** The bars shown in a mode, in bar order. */
export function barsInMode(data: LayoutData, mode: string): string[] {
  return barsOf(data)
    .filter(([, bar]) => bar.mode === mode)
    .map(([id]) => id);
}

/** What {@link compileBar} leaves out. */
export interface CompileBarOptions {
  /**
   * Command ids to leave out, as if the bar didn't name them: a mode tab whose bars show nothing,
   * a button whose menu is empty. With every mode tab left out, View goes too.
   */
  readonly omit?: ReadonlySet<string>;
}

const NOTHING: ReadonlySet<string> = new Set();

const toBarChild = (item: LayoutItem): BarChild => {
  if (typeof item === 'string') return item;
  if ('custom' in item) {
    const custom: { -readonly [Key in keyof CustomItem]: CustomItem[Key] } = { slot: item.custom };
    if (item.command !== undefined) custom.terminal = item.command;
    if (item.variants !== undefined) custom.variants = item.variants;
    if (item.importance !== undefined) custom.importance = item.importance;
    return custom;
  }
  const command: { -readonly [Key in keyof BarItem]: BarItem[Key] } = { command: item.command };
  if (item.variants !== undefined) command.variants = item.variants;
  if (item.importance !== undefined) command.importance = item.importance;
  return command;
};

/** The mode tabs, each a label at importance 1, so the tab strip is the first to compact. */
function modeTabsOf(data: LayoutData, omit: ReadonlySet<string>): BarItem[] {
  const modes = modesOf(data)
    .map(modeCommandOf)
    .filter((command) => !omit.has(command));
  if (modes.length === 0) return [];
  const commands = omit.has(VIEW_MODE_COMMAND) ? modes : [VIEW_MODE_COMMAND, ...modes];
  return commands.map((command) => ({ command, variants: ['label'], importance: 1 }));
}

/**
 * A bar as the toolbar fits it, or `null` for a bar the layout doesn't have. Groups written as
 * arrays and lone items get ids of their own (`start-0`, …); an item twice in one group shows
 * once; a group with nothing left goes.
 */
export function compileBar(
  data: LayoutData,
  id: string,
  options: CompileBarOptions = {},
): BarSchema | null {
  const bar = data.bars?.[id];
  if (typeof bar !== 'object' || bar === null) return null;
  const omit = options.omit ?? NOTHING;
  const used = new Set<string>();
  const uniqueId = (wanted: string): string => {
    let groupId = wanted;
    for (let count = 2; used.has(groupId); count++) groupId = `${wanted}-${count}`;
    used.add(groupId);
    return groupId;
  };

  const sections: { -readonly [Name in SectionName]?: readonly BarGroup[] } = {};
  for (const name of SECTION_NAMES) {
    const groups: BarGroup[] = [];
    entriesOf(bar, name).forEach((entry, index) => {
      const object = isGroupObject(entry) ? entry : null;
      const seen = new Set<string>();
      let items: LayoutItem[] = itemsOfEntry(entry).filter((item) => {
        if (!isLayoutItem(item)) return false;
        const itemId = itemIdOf(item);
        if (seen.has(itemId)) return false;
        seen.add(itemId);
        return typeof item === 'object' && 'custom' in item ? true : !omit.has(itemId);
      });
      const isModes = object?.id === MODES_GROUP;
      if (isModes)
        items = [...modeTabsOf(data, omit).filter((tab) => !seen.has(tab.command)), ...items];
      if (items.length === 0) return;
      const group: { -readonly [Key in keyof BarGroup]: BarGroup[Key] } = {
        id: uniqueId(object?.id ?? `${name}-${index}`),
        items: items.map(toBarChild),
      };
      if (isModes) group.role = 'tabs';
      if (object?.titleKey !== undefined) group.labelKey = object.titleKey;
      if (object?.shed !== undefined) group.shed = object.shed;
      if (object?.collapse !== undefined) group.collapse = object.collapse;
      if (object?.importance !== undefined) group.importance = object.importance;
      groups.push(group);
    });
    if (groups.length > 0) sections[name] = groups;
  }
  return { id, sections: sections as BarSections };
}

/** A menu section, read: its title and its command ids. */
export interface MenuSection {
  readonly title?: string;
  readonly titleKey?: string;
  readonly items: readonly string[];
}

/** A menu's sections, or `null` for a menu the layout doesn't have. An empty section goes. */
export function menuOf(data: LayoutData, id: string): readonly MenuSection[] | null {
  const menu = data.menus?.[id];
  if (!menu) return null;
  const commandsOf = (section: LayoutMenuSection) => [
    ...new Set(itemsOfMenuSection(section).filter((item) => typeof item === 'string')),
  ];
  return sectionsOfMenu(menu)
    .map((section: LayoutMenuSection): MenuSection => {
      if (Array.isArray(section) || typeof section !== 'object' || section === null)
        return { items: commandsOf(section) };
      const titled = section as Exclude<LayoutMenuSection, readonly string[]>;
      const read: { -readonly [Key in keyof MenuSection]: MenuSection[Key] } = {
        items: commandsOf(section),
      };
      if (titled.title !== undefined) read.title = titled.title;
      if (titled.titleKey !== undefined) read.titleKey = titled.titleKey;
      return read;
    })
    .filter((section) => section.items.length > 0);
}

// ── what shows nothing ───────────────────────────────────────────────────────

/** What {@link omittedCommandsOf} reads of a command; plugin-commands' `ResolvedCommand` satisfies it. */
export interface OmissionCommand {
  readonly visible: boolean;
  readonly menu?: string;
}

/** A layout's mode bars and menus, read once per layout data. */
interface LayoutReach {
  readonly modes: readonly (readonly [string, readonly NormalizedBar[]])[];
  readonly menus: ReadonlyMap<string, readonly string[]>;
  /** Every command a bar names: the ones that may open a menu. */
  readonly buttons: readonly string[];
}

const reachByData = new WeakMap<LayoutData, LayoutReach>();

function reachOf(data: LayoutData): LayoutReach {
  const known = reachByData.get(data);
  if (known) return known;
  const modes = modesOf(data).map(
    (mode) =>
      [mode, barsInMode(data, mode).map((id) => normalizeBar(compileBar(data, id)!))] as const,
  );
  const menus = new Map(
    Object.keys(data.menus ?? {}).map((id) => [
      id,
      menuOf(data, id)!.flatMap((section) => section.items),
    ]),
  );
  const buttons = new Set<string>();
  for (const [, bar] of barsOf(data))
    for (const name of SECTION_NAMES)
      for (const entry of entriesOf(bar, name))
        for (const item of itemsOfEntry(entry))
          if (typeof item === 'string') buttons.add(item);
          else if (isLayoutItem(item) && !('custom' in item)) buttons.add(item.command);
  const reach = { modes, menus, buttons: [...buttons] };
  reachByData.set(data, reach);
  return reach;
}

/**
 * The commands the bars leave out because what they lead to shows nothing: the tab of a mode
 * whose bars have nothing visible, and a button whose menu has nothing visible (or that the
 * layout has no menu for). Sorted, so two equal results compare equal; pass it to
 * {@link compileBar} as `omit`. Cheap to call on every change: what it reads of the layout is
 * read once per layout data.
 */
export function omittedCommandsOf(
  data: LayoutData,
  resolve: (id: string) => OmissionCommand | null,
): string[] {
  const reach = reachOf(data);
  const isVisible = (id: string) => resolve(id)?.visible === true;
  const omitted: string[] = [];
  for (const [mode, bars] of reach.modes) {
    const shows = bars.some((bar) =>
      hasVisibleUnits(bar, (unit) => {
        const command = commandOfUnit(unit);
        return command !== null && isVisible(command);
      }),
    );
    if (!shows) omitted.push(modeCommandOf(mode));
  }
  for (const button of reach.buttons) {
    const menu = resolve(button)?.menu;
    if (menu !== undefined && !(reach.menus.get(menu) ?? []).some(isVisible)) omitted.push(button);
  }
  return omitted.sort();
}
