/**
 * The outline as the plugin holds it, and the pure functions that read it.
 *
 * The tree keeps every item by key and each parent's children in order, the
 * top level under {@link TOP}; `sync/tree.ts` changes it, by confirmed events
 * and by pending changes. Here: the rows a tree view shows, the item for the
 * reading position, and the session state, which items are expanded and which
 * are selected.
 */
import type {
  DocumentOutline,
  OutlineItem,
  OutlineItemRef,
  PageRef,
} from '@embedpdf/engine-core/runtime';

import type { OutlineRow } from './contract';

/* ── the tree ────────────────────────────────────────────────────────────── */

/** An item's key: its object number, as a string. */
export type OutlineKey = string;

/** The key the top level's items are listed under. */
export const TOP: OutlineKey = 'top';

export const outlineKeyOf = (ref: OutlineItemRef | null): OutlineKey =>
  ref ? String(ref.objectNumber) : TOP;

export interface OutlineTree {
  /** Every item, by key. */
  readonly items: Readonly<Record<OutlineKey, OutlineItem>>;
  /** Each parent's children in order, the top level under {@link TOP}; a leaf has no entry. */
  readonly children: Readonly<Record<OutlineKey, readonly OutlineKey[]>>;
  /** The read stopped early: part of the outline is not here. */
  readonly incomplete: boolean;
}

const NO_CHILDREN: readonly OutlineKey[] = Object.freeze([]);

export const childrenOf = (tree: OutlineTree, parent: OutlineKey): readonly OutlineKey[] =>
  tree.children[parent] ?? NO_CHILDREN;

/** The tree of a read: every item under its parent, in the read's order. */
export function treeOf(outline: DocumentOutline): OutlineTree {
  const items: Record<OutlineKey, OutlineItem> = {};
  const children: Record<OutlineKey, OutlineKey[]> = {};
  for (const item of outline.items) {
    const key = outlineKeyOf(item.ref);
    items[key] = item;
    (children[outlineKeyOf(item.parent)] ??= []).push(key);
  }
  return { items, children, incomplete: outline.incomplete };
}

/** Every item, depth first: a parent before its children, siblings in their order. */
export function itemsOf(tree: OutlineTree): OutlineItem[] {
  const list: OutlineItem[] = [];
  const visit = (parent: OutlineKey): void => {
    for (const key of childrenOf(tree, parent)) {
      const item = tree.items[key];
      if (!item) continue;
      list.push(item);
      visit(key);
    }
  };
  visit(TOP);
  return list;
}

/** The keys of `key` and every item under it, depth first. */
export function subtreeOf(tree: OutlineTree, key: OutlineKey): OutlineKey[] {
  const keys = [key];
  for (let i = 0; i < keys.length; i += 1) keys.push(...childrenOf(tree, keys[i]!));
  return keys;
}

/** The keys of the items `key` sits under, nearest first; empty at the top level. */
export function ancestorsOf(tree: OutlineTree, key: OutlineKey): OutlineKey[] {
  const ancestors: OutlineKey[] = [];
  const seen = new Set<OutlineKey>([key]);
  for (let parent = tree.items[key]?.parent ?? null; parent; ) {
    const parentKey = outlineKeyOf(parent);
    if (seen.has(parentKey)) break;
    seen.add(parentKey);
    ancestors.push(parentKey);
    parent = tree.items[parentKey]?.parent ?? null;
  }
  return ancestors;
}

/**
 * The refs a delete names, each once, without the ones under another named
 * ref: they go with it.
 */
export function topmostOf(tree: OutlineTree, refs: readonly OutlineItemRef[]): OutlineItemRef[] {
  const named = new Set(refs.map(outlineKeyOf));
  const seen = new Set<OutlineKey>();
  return refs.filter((ref) => {
    const key = outlineKeyOf(ref);
    if (seen.has(key)) return false;
    seen.add(key);
    return !ancestorsOf(tree, key).some((ancestor) => named.has(ancestor));
  });
}

/* ── rows ────────────────────────────────────────────────────────────────── */

/** The rows that show: every item whose parents are all expanded, depth first. */
export function rowsOf(
  tree: OutlineTree,
  expanded: Readonly<Record<OutlineKey, true>>,
): OutlineRow[] {
  const rows: OutlineRow[] = [];
  const visit = (parent: OutlineKey, depth: number): void => {
    for (const key of childrenOf(tree, parent)) {
      const item = tree.items[key];
      if (!item) continue;
      const hasChildren = childrenOf(tree, key).length > 0;
      const open = hasChildren && expanded[key] === true;
      rows.push({ item, depth, hasChildren, expanded: open });
      if (open) visit(key, depth + 1);
    }
  };
  visit(TOP, 0);
  return rows;
}

/* ── the reading position ────────────────────────────────────────────────── */

/** Where an item goes, as a place in reading order. */
export interface OutlineSpot {
  readonly key: OutlineKey;
  readonly pageIndex: number;
  readonly y: number;
}

/**
 * Every item that goes to a page of this document, in reading order: by
 * page, then down the page, then in outline order. An item with no point on
 * its page goes to the page's top.
 */
export function spotsOf(
  items: readonly OutlineItem[],
  pageIndexOf: (page: PageRef) => number | null,
): OutlineSpot[] {
  const spots: (OutlineSpot & { order: number })[] = [];
  items.forEach((item, order) => {
    const target = item.target;
    if (target?.kind !== 'goto') return;
    const { destination } = target;
    const pageIndex = pageIndexOf(destination.page);
    if (pageIndex === null) return;
    const y = 'y' in destination ? (destination.y ?? 0) : 0;
    spots.push({ key: outlineKeyOf(item.ref), pageIndex, y, order });
  });
  return spots.sort(
    (left, right) =>
      left.pageIndex - right.pageIndex || left.y - right.y || left.order - right.order,
  );
}

/** How far below the top of the view an item's spot may be and still count as reached, in points. */
const REACHED_TOLERANCE = 1;

/** The last spot at or above the reading position, or `null` before the first. */
export function spotAt(
  spots: readonly OutlineSpot[],
  pageIndex: number,
  y: number,
): OutlineSpot | null {
  let low = 0;
  let high = spots.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    const spot = spots[middle]!;
    const reached =
      spot.pageIndex < pageIndex ||
      (spot.pageIndex === pageIndex && spot.y <= y + REACHED_TOLERANCE);
    if (reached) low = middle + 1;
    else high = middle;
  }
  return low > 0 ? spots[low - 1]! : null;
}

/* ── the session ─────────────────────────────────────────────────────────── */

export interface OutlineState {
  /** The items whose children show. Starts from the items the file opens. */
  readonly expanded: Readonly<Record<OutlineKey, true>>;
  /** Whether `expanded` started from the file's open items: on the first load. */
  readonly seeded: boolean;
  readonly selected: readonly OutlineItemRef[];
}

export const initialOutlineState = (): OutlineState => ({
  expanded: {},
  seeded: false,
  selected: [],
});

/** The first load: the items the file opens start expanded. Later loads keep what the user chose. */
export function seeded(state: OutlineState, tree: OutlineTree): OutlineState {
  if (state.seeded) return state;
  const expanded: Record<OutlineKey, true> = { ...state.expanded };
  for (const [key, item] of Object.entries(tree.items)) if (item.open) expanded[key] = true;
  return { ...state, expanded, seeded: true };
}

export function expanded(state: OutlineState, keys: readonly OutlineKey[]): OutlineState {
  const added = keys.filter((key) => state.expanded[key] !== true);
  if (added.length === 0) return state;
  const next: Record<OutlineKey, true> = { ...state.expanded };
  for (const key of added) next[key] = true;
  return { ...state, expanded: next };
}

export function collapsed(state: OutlineState, keys: readonly OutlineKey[]): OutlineState {
  const removed = keys.filter((key) => state.expanded[key] === true);
  if (removed.length === 0) return state;
  const next: Record<OutlineKey, true> = { ...state.expanded };
  for (const key of removed) delete next[key];
  return { ...state, expanded: next };
}

export function selected(state: OutlineState, refs: readonly OutlineItemRef[]): OutlineState {
  const keys = refs.map(outlineKeyOf);
  const unique = refs.filter((_ref, i) => keys.indexOf(keys[i]!) === i);
  const same =
    unique.length === state.selected.length &&
    unique.every((ref, i) => ref.objectNumber === state.selected[i]!.objectNumber);
  return same ? state : { ...state, selected: unique };
}

/** Forget what names items the tree no longer has. */
export function pruned(state: OutlineState, tree: OutlineTree): OutlineState {
  const expandedKeys = Object.keys(state.expanded).filter((key) => !tree.items[key]);
  const selection = state.selected.filter((ref) => tree.items[outlineKeyOf(ref)]);
  if (expandedKeys.length === 0 && selection.length === state.selected.length) return state;
  const next = collapsed(state, expandedKeys);
  return selection.length === state.selected.length ? next : { ...next, selected: selection };
}
