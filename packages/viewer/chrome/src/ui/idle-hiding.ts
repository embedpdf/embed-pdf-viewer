/**
 * Which floating bar rests out of sight while nothing moves, and for how long
 * it waits. A floating bar whose place says `hideWhenIdle: true` fades out once
 * the pages and the pointer have been still for a moment, and comes back when
 * they move; one that says `false` stays. A place that says neither hides a bar
 * with the page number, at every size.
 */
import type { BarSchema } from '@embedpdf/core-ui';

/** The slot of the built-in page number item. */
export const PAGE_NUMBER_SLOT = 'page-number';

/** How long the pages and the pointer stay still before the bar fades out. */
export const IDLE_MS = 2000;

/** Whether `bar` holds the custom item drawn in `slot`. */
export function holdsSlot(bar: BarSchema, slot: string): boolean {
  const { start = [], center = [], end = [] } = bar.sections;
  return [...start, ...center, ...end].some((group) =>
    group.items.some(
      (child) => typeof child === 'object' && 'slot' in child && child.slot === slot,
    ),
  );
}

/**
 * Whether a floating bar hides while nothing moves: as its place's `hideWhenIdle` says
 * (`hideWhenIdleOf`), else when it holds the page number.
 */
export function hidesWhenIdle(hideWhenIdle: boolean | undefined, bar: BarSchema | null): boolean {
  if (bar === null) return false;
  return hideWhenIdle ?? holdsSlot(bar, PAGE_NUMBER_SLOT);
}
