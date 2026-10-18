import type { MutationMeta } from './MutationMeta';
import type { OutlineItem } from '../dto/DocumentOutline';
import type { PageDestination } from '../dto/PdfDestination';
import type { OutlineItemRef } from '../identity/OutlineItemRef';

/**
 * The meta of every outline write: the items it touched, created, updated,
 * moved and deleted alike; each result says which. Names never change, so
 * nothing a caller holds goes stale.
 */
export interface OutlineMutationMeta extends MutationMeta {
  changed: OutlineItemRef[];
}

/**
 * One parent's children as a write left them, in order: where an item now
 * is, as a fact rather than a position. `parent: null` is the top level.
 */
export interface OutlineOrder {
  parent: OutlineItemRef | null;
  children: OutlineItemRef[];
}

/** Result of `doc.outline.create()`: the new item, and its parent's children with it. */
export interface OutlineCreateResult<D = PageDestination> {
  item: OutlineItem<D>;
  order: OutlineOrder;
  meta: OutlineMutationMeta;
}

/** Result of `doc.outline.update()`: the item as the update left it. */
export interface OutlineUpdateResult<D = PageDestination> {
  item: OutlineItem<D>;
  meta: OutlineMutationMeta;
}

/**
 * Result of `doc.outline.move()`: the children of every parent the move
 * changed (the parents the items left and the one they went to), and in
 * `meta.changed` the items that moved. An item that lost its last child is
 * no longer open: a leaf has no open state.
 */
export interface OutlineMoveResult {
  orders: OutlineOrder[];
  meta: OutlineMutationMeta;
}

/**
 * Result of `doc.outline.delete()`: in `meta.changed`, what went: the item
 * first, then the items under it (see `deletedOutlineItemsOf`).
 */
export interface OutlineDeleteResult {
  meta: OutlineMutationMeta;
}

/**
 * What an undo of a delete brought back: the same items under the refs they
 * had, the item first and the items under it depth first, and its parent's
 * children with it.
 */
export interface OutlineRestoreResult<D = PageDestination> {
  items: OutlineItem<D>[];
  order: OutlineOrder;
  meta: OutlineMutationMeta;
}

/** What a delete removed, as its `outline.deleted` event names it: the item first. */
export function deletedOutlineItemsOf(result: OutlineDeleteResult): OutlineItemRef[] {
  return result.meta.changed;
}
