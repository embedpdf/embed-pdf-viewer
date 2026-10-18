/**
 * How the outline tree changes: `foldOutline` applies one confirmed event's
 * facts, the mirror's `fold`; `predictOutline` applies one op of a pending
 * change by the engine's rules (engine-core's `outlineItemOfDraft`,
 * `outlineItemAfter` and `outlineItemWithChildren`), the mirror's `predict`;
 * `undoOf` says what undoing ops looks like. Pure.
 */
import { reload, type MirrorReload, type PredictedOp } from '@embedpdf/core';
import {
  outlineItemAfter,
  outlineItemOfDraft,
  outlineItemWithChildren,
  positionIndex,
  toOutlineItemRef,
  type ChangeOp,
  type DocumentEvent,
  type OutlineItem,
  type OutlineItemRef,
  type OutlinePosition,
} from '@embedpdf/engine-core/runtime';

import {
  ancestorsOf,
  childrenOf,
  outlineKeyOf,
  subtreeOf,
  TOP,
  type OutlineKey,
  type OutlineTree,
} from '../model';

const refOf = (key: OutlineKey): OutlineItemRef | null =>
  key === TOP ? null : toOutlineItemRef(Number(key));

/** The tree with `parent`'s children set, and its open state kept true to them. */
function withChildren(
  tree: OutlineTree,
  parent: OutlineKey,
  keys: readonly OutlineKey[],
): OutlineTree {
  const children: Record<OutlineKey, readonly OutlineKey[]> = { ...tree.children };
  if (keys.length > 0) children[parent] = keys;
  else delete children[parent];
  const item = tree.items[parent];
  const opened = item ? outlineItemWithChildren(item, keys.length > 0) : item;
  return {
    ...tree,
    children,
    items: opened === item ? tree.items : { ...tree.items, [parent]: opened! },
  };
}

/** The tree with these items put in, replacing ones with the same key. */
function withItems(tree: OutlineTree, items: readonly OutlineItem[]): OutlineTree {
  if (items.length === 0) return tree;
  const next = { ...tree.items };
  for (const item of items) next[outlineKeyOf(item.ref)] = item;
  return { ...tree, items: next };
}

/** The tree without `key` and the items under it; their parent keeps its other children. */
function withoutSubtree(tree: OutlineTree, key: OutlineKey): OutlineTree {
  const item = tree.items[key];
  if (!item) return tree;
  const gone = subtreeOf(tree, key);
  const items = { ...tree.items };
  const children = { ...tree.children };
  for (const removed of gone) {
    delete items[removed];
    delete children[removed];
  }
  const parent = outlineKeyOf(item.parent);
  return withChildren(
    { ...tree, items, children },
    parent,
    childrenOf(tree, parent).filter((child) => child !== key),
  );
}

/** Where `position` falls among `parent`'s children, or `null` when its neighbour isn't one. */
function indexAt(keys: readonly OutlineKey[], position: OutlinePosition): number | null {
  try {
    return positionIndex(
      keys.map(refOf).filter((ref): ref is OutlineItemRef => ref !== null),
      position,
      outlineKeyOf,
    );
  } catch {
    return null;
  }
}

const inserted = (
  keys: readonly OutlineKey[],
  at: number,
  added: readonly OutlineKey[],
): OutlineKey[] => [...keys.slice(0, at), ...added, ...keys.slice(at)];

/* ── confirmed events ────────────────────────────────────────────────────── */

/**
 * One confirmed event, applied with the facts it carries: the same for every
 * origin. Before the first load there is nothing to apply it to. A page
 * delete changes where items go (a target on a page that went reads as
 * unsupported), so the outline is read again.
 */
export function foldOutline(
  tree: OutlineTree | null,
  event: DocumentEvent,
): OutlineTree | null | MirrorReload {
  if (event.type === 'pages.deleted') return tree ? reload() : tree;
  if (!tree) return tree;
  switch (event.type) {
    case 'outline.created':
      return withChildren(
        withItems(tree, [event.item]),
        outlineKeyOf(event.order.parent),
        event.order.children.map(outlineKeyOf),
      );
    case 'outline.updated':
      return withItems(tree, [event.item]);
    case 'outline.moved': {
      let next = tree;
      for (const order of event.orders) {
        const parent = outlineKeyOf(order.parent);
        next = withChildren(next, parent, order.children.map(outlineKeyOf));
        next = withItems(
          next,
          order.children.flatMap((ref) => {
            const item = next.items[outlineKeyOf(ref)];
            return item && outlineKeyOf(item.parent) !== parent
              ? [{ ...item, parent: order.parent }]
              : [];
          }),
        );
      }
      return next;
    }
    case 'outline.deleted': {
      const [first] = event.deleted;
      return first ? withoutSubtree(tree, outlineKeyOf(first)) : tree;
    }
    case 'outline.restored':
      return withChildren(
        withRestored(tree, event.items),
        outlineKeyOf(event.order.parent),
        event.order.children.map(outlineKeyOf),
      );
    default:
      return tree;
  }
}

/**
 * The tree with restored items in it: each item as given, and the children
 * of each restored item rebuilt from the items' parents, in the given order.
 * The first item's place among its parent's children is set by the caller.
 */
function withRestored(tree: OutlineTree, items: readonly OutlineItem[]): OutlineTree {
  const restored = withItems(tree, items);
  const children: Record<OutlineKey, readonly OutlineKey[]> = { ...restored.children };
  const keys = new Set(items.map((item) => outlineKeyOf(item.ref)));
  const rebuilt: Record<OutlineKey, OutlineKey[]> = {};
  for (const item of items.slice(1)) {
    const parent = outlineKeyOf(item.parent);
    if (keys.has(parent)) (rebuilt[parent] ??= []).push(outlineKeyOf(item.ref));
  }
  for (const key of keys) {
    if (rebuilt[key]) children[key] = rebuilt[key];
    else delete children[key];
  }
  return { ...restored, children };
}

/* ── pending changes ─────────────────────────────────────────────────────── */

/**
 * One op of a change this session staged, shown before the engine answers,
 * by the engine's rules. Absolute: an op the tree already holds changes
 * nothing. An op the engine would refuse (a parent or neighbour that isn't
 * there, a move under itself) leaves the tree as it is.
 */
export function predictOutline(tree: OutlineTree | null, op: PredictedOp): OutlineTree | null {
  if (!tree) return tree;
  switch (op.type) {
    case 'outline.create': {
      if (op.objectNumber === undefined) return tree;
      const ref = toOutlineItemRef(op.objectNumber);
      const key = outlineKeyOf(ref);
      const parent = outlineKeyOf(op.parent);
      if (tree.items[key] || (parent !== TOP && !tree.items[parent])) return tree;
      const siblings = childrenOf(tree, parent);
      const at = indexAt(siblings, op.position ?? 'end');
      if (at === null) return tree;
      return withChildren(
        withItems(tree, [outlineItemOfDraft(ref, op.parent, op.data)]),
        parent,
        inserted(siblings, at, [key]),
      );
    }
    case 'outline.update': {
      const key = outlineKeyOf(op.ref);
      const item = tree.items[key];
      if (!item) return tree;
      const next = outlineItemAfter(item, op.patch, childrenOf(tree, key).length > 0);
      return next === item ? tree : withItems(tree, [next]);
    }
    case 'outline.move':
      return movedTree(tree, op.refs.map(outlineKeyOf), op.parent, op.position);
    case 'outline.delete':
      return withoutSubtree(tree, outlineKeyOf(op.ref));
    case 'outline.restore':
      return restoredTree(tree, op.items, op.index);
    default:
      return tree;
  }
}

/** `outline.move`: the items, with the items under them, at `position` among `parent`'s children. */
function movedTree(
  tree: OutlineTree,
  moved: readonly OutlineKey[],
  parent: OutlineItemRef | null,
  position: OutlinePosition,
): OutlineTree {
  const target = outlineKeyOf(parent);
  if (target !== TOP && !tree.items[target]) return tree;
  if (new Set(moved).size !== moved.length || moved.some((key) => !tree.items[key])) return tree;
  // No item under itself, and no item together with one it holds.
  const movedSet = new Set(moved);
  for (const key of moved) {
    if (key === target || ancestorsOf(tree, key).some((ancestor) => movedSet.has(ancestor))) {
      return tree;
    }
  }
  if (ancestorsOf(tree, target).some((ancestor) => movedSet.has(ancestor))) return tree;
  const staying = childrenOf(tree, target).filter((key) => !movedSet.has(key));
  const at = indexAt(staying, position);
  if (at === null) return tree;
  const order = inserted(staying, at, moved);
  if (sameKeys(order, childrenOf(tree, target))) return tree;

  let next = tree;
  const left = new Set(moved.map((key) => outlineKeyOf(tree.items[key]!.parent)));
  left.delete(target);
  for (const old of left) {
    next = withChildren(
      next,
      old,
      childrenOf(next, old).filter((key) => !movedSet.has(key)),
    );
  }
  next = withChildren(next, target, order);
  return withItems(
    next,
    moved.flatMap((key) => {
      const item = next.items[key]!;
      return outlineKeyOf(item.parent) === target ? [] : [{ ...item, parent }];
    }),
  );
}

/**
 * `outline.restore`: the items as they were, the first at `index` among its
 * parent's children, wherever they are now and whether or not they are here.
 */
function restoredTree(
  tree: OutlineTree,
  items: readonly OutlineItem[],
  index: number,
): OutlineTree {
  const [first] = items;
  if (!first) return tree;
  const parent = outlineKeyOf(first.parent);
  if (parent !== TOP && !tree.items[parent]) return tree;
  const key = outlineKeyOf(first.ref);
  let next = tree;
  // Take out what is here now, so nothing is listed twice.
  for (const item of items) {
    const current = next.items[outlineKeyOf(item.ref)];
    if (!current) continue;
    const from = outlineKeyOf(current.parent);
    next = withChildren(
      next,
      from,
      childrenOf(next, from).filter((child) => child !== outlineKeyOf(item.ref)),
    );
  }
  const siblings = childrenOf(next, parent);
  const at = Math.max(0, Math.min(index, siblings.length));
  return withChildren(withRestored(next, items), parent, inserted(siblings, at, [key]));
}

const sameKeys = (left: readonly OutlineKey[], right: readonly OutlineKey[]): boolean =>
  left.length === right.length && left.every((key, i) => key === right[i]);

/** The item and the items under it, as the tree holds them: what a restore brings back. */
function restoreOf(tree: OutlineTree, key: OutlineKey): PredictedOp | null {
  const item = tree.items[key];
  if (!item) return null;
  const items = subtreeOf(tree, key).flatMap((child) => {
    const held = tree.items[child];
    return held ? [held] : [];
  });
  return {
    type: 'outline.restore',
    items,
    index: childrenOf(tree, outlineKeyOf(item.parent)).indexOf(key),
  };
}

/** What undoing one op looks like, read off the tree it applies to. */
function undoOfOp(tree: OutlineTree, op: ChangeOp): PredictedOp[] {
  switch (op.type) {
    case 'outline.create':
      return op.objectNumber === undefined
        ? []
        : [{ type: 'outline.delete', ref: toOutlineItemRef(op.objectNumber) }];
    case 'outline.update':
    case 'outline.delete': {
      const restore = restoreOf(tree, outlineKeyOf(op.ref));
      return restore ? [restore] : [];
    }
    case 'outline.move': {
      // Each item back at its place, the first places first, so each index holds.
      const restores = op.refs.flatMap((ref) => {
        const restore = restoreOf(tree, outlineKeyOf(ref));
        return restore ? [restore] : [];
      });
      return restores.sort((left, right) =>
        left.type === 'outline.restore' && right.type === 'outline.restore'
          ? left.index - right.index
          : 0,
      );
    }
    default:
      return [];
  }
}

/**
 * What undoing `ops` looks like, read off the tree they apply to, each op
 * on the tree the ops before it leave; the last op is undone first.
 */
export function undoOf(tree: OutlineTree | null, ops: readonly ChangeOp[]): PredictedOp[] {
  if (!tree) return [];
  const undo: PredictedOp[][] = [];
  let current = tree;
  for (const op of ops) {
    undo.push(undoOfOp(current, op));
    current = predictOutline(current, op) ?? current;
  }
  return undo.reverse().flat();
}
