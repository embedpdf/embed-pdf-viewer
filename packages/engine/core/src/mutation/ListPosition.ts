import { EngineError } from '../errors/EngineError';
import { EngineErrorCode } from '../errors/EngineErrorCode';
import type { AnnotationRef } from '../identity/AnnotationRef';
import type { PageRef } from '../identity/PageRef';

/**
 * Where rows go in their list: right before or after a neighbour, or at the
 * start or the end. A position names a neighbour, never a number, so a change
 * keeps its meaning when other rows come and go before it applies, and a
 * caller only names rows it can see.
 *
 * Each list is in its own order: a document's pages in display order; a
 * page's annotations, and its widgets, each in paint order, later over
 * earlier. Widgets always paint above annotations, so the two are separate
 * lists and a position names a neighbour of the same kind.
 */
export type ListPosition<Ref> =
  | { readonly before: Ref }
  | { readonly after: Ref }
  | 'start'
  | 'end';

/** Where pages go among the document's pages. */
export type PagePosition = ListPosition<PageRef>;

/** Where annotations go among their page's annotations, or widgets among its widgets. */
export type AnnotationPosition = ListPosition<AnnotationRef>;

/** The neighbour a position names, or `null` for `'start'` and `'end'`. */
export function anchorOf<Ref>(position: ListPosition<Ref>): Ref | null {
  if (position === 'start' || position === 'end') return null;
  return 'before' in position ? position.before : position.after;
}

/**
 * Where `position` falls in `order`: the index the first row placed there
 * gets. The neighbour must be in `order` (`NotFound` otherwise).
 */
export function positionIndex<Ref>(
  order: readonly Ref[],
  position: ListPosition<Ref>,
  keyOf: (ref: Ref) => string,
): number {
  if (position === 'start') return 0;
  if (position === 'end') return order.length;
  const anchor = anchorOf(position)!;
  const at = order.findIndex((ref) => keyOf(ref) === keyOf(anchor));
  if (at < 0) {
    throw new EngineError(EngineErrorCode.NotFound, `no neighbour ${keyOf(anchor)} in the list`, {
      details: { field: 'position' },
    });
  }
  return 'before' in position ? at : at + 1;
}

/**
 * A list's order once `moved` go to `position`, together and in the order
 * given: what a reorder answers, worked out as the engine does. Every moved
 * row must be in `order`, once (`InvalidArg` otherwise), and the neighbour
 * can't be one of them (`InvalidArg`).
 */
export function reorderedList<Ref>(
  order: readonly Ref[],
  moved: readonly Ref[],
  position: ListPosition<Ref>,
  keyOf: (ref: Ref) => string,
): Ref[] {
  const movedKeys = new Set(moved.map(keyOf));
  if (movedKeys.size !== moved.length) {
    throw new EngineError(EngineErrorCode.InvalidArg, 'a row is named twice', {
      details: { field: 'refs' },
    });
  }
  const present = new Set(order.map(keyOf));
  const missing = moved.find((ref) => !present.has(keyOf(ref)));
  if (missing !== undefined) {
    throw new EngineError(EngineErrorCode.NotFound, `no row ${keyOf(missing)} in the list`, {
      details: { field: 'refs' },
    });
  }
  const anchor = anchorOf(position);
  if (anchor !== null && movedKeys.has(keyOf(anchor))) {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      `the neighbour ${keyOf(anchor)} is one of the rows that move`,
      { details: { field: 'position' } },
    );
  }
  const staying = order.filter((ref) => !movedKeys.has(keyOf(ref)));
  const at = positionIndex(staying, position, keyOf);
  return [...staying.slice(0, at), ...moved, ...staying.slice(at)];
}

/**
 * `list` with the items `inPart` picks put in the order `order` gives them,
 * by key, in the slots those items have: every other item keeps its place.
 * How a list holding several pages takes one page's new order. Items of the
 * part `order` doesn't name follow the named ones, in their order.
 */
export function reorderPart<Item, Key>(
  list: readonly Item[],
  inPart: (item: Item) => boolean,
  order: readonly Key[],
  keyOf: (item: Item) => Key,
): Item[] {
  const part = list.filter(inPart);
  const byKey = new Map(part.map((item) => [keyOf(item), item]));
  const named: Item[] = order.flatMap((key) => (byKey.has(key) ? [byKey.get(key)!] : []));
  const placed = new Set<Item>(named);
  const next = [...named, ...part.filter((item) => !placed.has(item))];
  let slot = 0;
  return list.map((item) => (inPart(item) ? next[slot++]! : item));
}
