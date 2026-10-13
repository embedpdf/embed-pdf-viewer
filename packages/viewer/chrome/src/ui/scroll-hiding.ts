/**
 * Which bar gets out of the way while the pages scroll, and what a scroll is.
 * On a phone (a compact viewer), a floating bar that holds the page number
 * hides while the pages move and comes back once they have been still for a
 * moment. Only a move at the same zoom is a scroll: a zoom keeps it.
 */
import type { BarSchema, ViewerSize } from '@embedpdf/core-ui';

/** The slot of the built-in page number item. */
export const PAGE_NUMBER_SLOT = 'page-number';

/** How long after the pages stop scrolling the page number comes back. */
export const SCROLL_SETTLE_MS = 700;

/** The camera of the pages: where they are, and their zoom. */
export interface ScrollCamera {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
}

/** Whether the camera moving from `previous` to `next` is a scroll: it moved, at the same zoom. */
export function isScrollOf(previous: ScrollCamera, next: ScrollCamera): boolean {
  return previous.zoom === next.zoom && (previous.x !== next.x || previous.y !== next.y);
}

/** Whether `bar` holds the custom item drawn in `slot`. */
export function holdsSlot(bar: BarSchema, slot: string): boolean {
  const { start = [], center = [], end = [] } = bar.sections;
  return [...start, ...center, ...end].some((group) =>
    group.items.some(
      (child) => typeof child === 'object' && 'slot' in child && child.slot === slot,
    ),
  );
}

/** Whether a floating bar hides while the pages scroll: on a phone, when it holds the page number. */
export function hidesWhileScrolling(bar: BarSchema | null, size: ViewerSize): boolean {
  return size === 'compact' && bar !== null && holdsSlot(bar, PAGE_NUMBER_SLOT);
}
