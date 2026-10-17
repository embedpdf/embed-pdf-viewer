import type { PagePosition } from './ListPosition';
import type { PageRef } from '../identity/PageRef';

/**
 * Input to `pages.reorder()`: the pages, by their durable refs, and where
 * they go, by a neighbour (`{ after: page }`) or `'start'` / `'end'`. They
 * land together, in the order given.
 */
export interface PageReorderInput {
  /**
   * Pages to move, in the order they should appear after the move.
   * Duplicates and unknown pages are refused.
   */
  pages: PageRef[];
  position: PagePosition;
}
