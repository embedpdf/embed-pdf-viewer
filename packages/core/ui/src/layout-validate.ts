/**
 * Checks a layout against the viewer it runs in: every id it names exists,
 * every place is a place, and every bar it is placed next to is where the
 * place says. Each problem is one sentence with the id, and the closest id
 * that exists when there is one, for a console warning: the viewer still
 * starts with a layout that has problems, and leaves out what it can't place.
 */
import type {
  BarPlace,
  Layout,
  LayoutBar,
  LayoutData,
  LayoutItem,
  LayoutMenu,
  LayoutPanel,
} from './layout';
import {
  SECTION_NAMES,
  isGroupObject,
  isLayout,
  isLayoutItem,
  itemCommandOf,
  itemIdOf,
  itemsOfEntry,
  itemsOfMenuSection,
  layoutWarningsOf,
} from './layout';
import {
  VIEW_MODE_COMMAND,
  edgeOf,
  hostOf,
  modeCommandOf,
  modesOf,
  panelCommandOf,
} from './layout-compile';
import { didYouMean } from './suggestions';

/** What the viewer has, to check a layout's ids against. */
export interface LayoutKnownIds {
  /**
   * Every command id the viewer has. The ones the layout makes itself need not be listed: the
   * mode tabs (`mode:view`, `mode:<mode>`) and the panel buttons (`panel:<id>`).
   */
  readonly commands: Iterable<string>;
  /** Whether a command id exists that `commands` can't list, such as one of a family's. */
  readonly hasCommand?: (id: string) => boolean;
}

const EDGES: readonly string[] = ['top', 'bottom', 'start', 'end'];
const FLOAT_POSITIONS: readonly string[] = [
  'top-start',
  'top',
  'top-end',
  'start',
  'end',
  'bottom-start',
  'bottom',
  'bottom-end',
];
const SELECTION_TARGETS: readonly string[] = ['selection', 'annotation'];
const PRESENTATIONS: readonly string[] = ['dock', 'overlay', 'sheet'];
const TABS: readonly string[] = ['always', 'multiple', 'never'];

/**
 * Every problem with a layout, as sentences: what its edits couldn't do first, then what its
 * data names that the viewer doesn't have. Empty when there is none.
 */
export function validateLayout(layout: Layout | LayoutData, known: LayoutKnownIds): string[] {
  const problems: string[] = isLayout(layout) ? [...layoutWarningsOf(layout)] : [];
  const data = isLayout(layout) ? layout.toJSON() : layout;
  if (typeof data !== 'object' || data === null)
    return [...problems, 'the layout is not an object'];

  const bars = data.bars ?? {};
  const knownCommands = new Set(known.commands);
  const commands = new Set(knownCommands);
  for (const mode of modesOf(data)) commands.add(modeCommandOf(mode));
  if (modesOf(data).length > 0) commands.add(VIEW_MODE_COMMAND);
  for (const panel of Object.keys(data.panels ?? {})) commands.add(panelCommandOf(panel));

  const checkCommand = (where: string, command: string) => {
    if (!commands.has(command) && known.hasCommand?.(command) !== true)
      problems.push(`${where}: no command "${command}"${didYouMean(command, commands)}`);
  };

  for (const [id, bar] of Object.entries(bars)) {
    const where = `bar "${id}"`;
    if (typeof bar !== 'object' || bar === null) {
      problems.push(`${where} is not a bar`);
      continue;
    }
    problems.push(...placeProblems(where, id, bar.place, data));
    if (bar.mode !== undefined && bar.title === undefined && bar.titleKey === undefined) {
      if (!knownCommands.has(modeCommandOf(bar.mode)))
        problems.push(
          `${where}: its mode "${bar.mode}" has no title, so its tab reads "${bar.mode}"`,
        );
    }
    problems.push(...itemProblems(where, bar, checkCommand));
  }

  for (const [id, menu] of Object.entries(data.menus ?? {}))
    problems.push(...menuProblems(`menu "${id}"`, menu, checkCommand));

  for (const [id, panel] of Object.entries(data.panels ?? {}))
    problems.push(...panelProblems(`panel "${id}"`, panel));

  if (data.tabs !== undefined && !TABS.includes(data.tabs))
    problems.push(`tabs: "${data.tabs}" is not one of always, multiple or never`);

  return problems;
}

function placeProblems(
  where: string,
  id: string,
  place: BarPlace | undefined,
  data: LayoutData,
): string[] {
  const bars = data.bars ?? {};
  const notAPlace = (shown: string) =>
    `${where}: ${shown} is not a place (an edge, { edge, before | after }, { float }, { with } or { at })`;
  if (place === undefined) return [`${where} has no place`];
  if (typeof place === 'string') return EDGES.includes(place) ? [] : [notAPlace(`"${place}"`)];
  if (typeof place !== 'object' || place === null) return [notAPlace(String(place))];

  if ('edge' in place) {
    if (!EDGES.includes(place.edge)) return [`${where}: "${place.edge}" is not an edge`];
    const anchor = place.before ?? place.after;
    if (anchor === undefined) return [];
    const side = place.before !== undefined ? 'before' : 'after';
    const onEdge = Object.keys(bars).filter(
      (other) => other !== id && edgeOf(bars[other]!.place) === place.edge,
    );
    if (onEdge.includes(anchor)) return [];
    if (bars[anchor])
      return [`${where} goes ${side} "${anchor}", which is not on the ${place.edge} edge`];
    return [`${where} goes ${side} "${anchor}": no such bar${didYouMean(anchor, onEdge)}`];
  }
  if ('float' in place)
    return FLOAT_POSITIONS.includes(place.float)
      ? []
      : [
          `${where}: "${place.float}" is not a floating position${didYouMean(place.float, FLOAT_POSITIONS)}`,
        ];
  if ('with' in place) {
    if (place.with === id) return [`${where} rides along itself`];
    if (!bars[place.with])
      return [
        `${where} rides along "${place.with}": no such bar${didYouMean(place.with, Object.keys(bars))}`,
      ];
    // A chain of `with` that comes back to this bar has nowhere to go.
    const seen = new Set([id]);
    for (let host: string | null = place.with; host !== null; host = hostOf(bars[host]?.place)) {
      if (seen.has(host)) return [`${where} rides along a bar that rides along it`];
      seen.add(host);
    }
    return [];
  }
  if ('at' in place)
    return SELECTION_TARGETS.includes(place.at)
      ? []
      : [`${where}: "${place.at}" is not selection or annotation`];
  return [notAPlace(JSON.stringify(place))];
}

function itemProblems(
  where: string,
  bar: LayoutBar,
  checkCommand: (where: string, command: string) => void,
): string[] {
  const problems: string[] = [];
  const groupIds = new Set<string>();
  let groups = 0;
  let dependentGroups = 0;
  for (const name of SECTION_NAMES) {
    const entries = bar[name];
    if (entries === undefined) continue;
    if (!Array.isArray(entries)) {
      problems.push(`${where}: its ${name} section is not a list of groups`);
      continue;
    }
    for (const entry of entries) {
      if (isGroupObject(entry) && entry.id !== undefined) {
        if (groupIds.has(entry.id)) problems.push(`${where}: two groups are called "${entry.id}"`);
        groupIds.add(entry.id);
      }
      groups++;
      if (isGroupObject(entry) && entry.dependent !== undefined) {
        const dependent: unknown = entry.dependent;
        if (dependent === true) dependentGroups++;
        else if (dependent !== false)
          problems.push(
            `${where}: ${entry.id === undefined ? 'a group' : `group "${entry.id}"`} has dependent ` +
              `${JSON.stringify(dependent)}, which is not true or false`,
          );
      }
      const seen = new Set<string>();
      for (const item of itemsOfEntry(entry) as readonly unknown[]) {
        if (!isLayoutItem(item)) {
          problems.push(`${where}: ${JSON.stringify(item)} is not an item`);
          continue;
        }
        const id = itemIdOf(item as LayoutItem);
        if (seen.has(id)) problems.push(`${where}: "${id}" is twice in one group`);
        seen.add(id);
        const command = itemCommandOf(item as LayoutItem);
        if (command !== null) checkCommand(where, command);
      }
    }
  }
  if (groups > 0 && dependentGroups === groups)
    problems.push(`${where}: every group in it is dependent, so it never shows`);
  return problems;
}

function menuProblems(
  where: string,
  menu: LayoutMenu,
  checkCommand: (where: string, command: string) => void,
): string[] {
  if (!Array.isArray(menu)) return [`${where} is not a list of sections`];
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const section of menu) {
    for (const command of itemsOfMenuSection(section) as readonly unknown[]) {
      if (typeof command !== 'string') {
        problems.push(`${where}: ${JSON.stringify(command)} is not a command id`);
        continue;
      }
      if (seen.has(command)) problems.push(`${where}: "${command}" is in it twice`);
      seen.add(command);
      checkCommand(where, command);
    }
  }
  return problems;
}

function panelProblems(where: string, panel: LayoutPanel): string[] {
  if (typeof panel !== 'object' || panel === null) return [`${where} is not a panel`];
  const problems: string[] = [];
  if (panel.side !== undefined && panel.side !== 'start' && panel.side !== 'end')
    problems.push(`${where}: side "${panel.side}" is not start or end`);
  if (panel.present !== undefined && !PRESENTATIONS.includes(panel.present))
    problems.push(`${where}: present "${panel.present}" is not dock, overlay or sheet`);
  if (
    panel.width !== undefined &&
    (typeof panel.width !== 'number' || !Number.isFinite(panel.width) || panel.width <= 0)
  )
    problems.push(`${where}: width ${JSON.stringify(panel.width)} is not a width in px`);
  return problems;
}
