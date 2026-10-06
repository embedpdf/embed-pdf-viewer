import type { MutationMeta } from './MutationMeta';
import type { PageListSnapshot } from '../dto/PageListSnapshot';
import type { Coordinates, PageCoordinates } from '../pageSpace/coordinates';

/**
 * Result of a `pages.move()`. Pages are always identified by
 * `pageObjectNumber`, and each page's /Annots is untouched, so every ref a
 * caller holds survives a reorder.
 *
 * What a move actually changes is the page order + geometry, so the result
 * returns the new `layout` (the same shape `pages.list()` returns). Callers
 * holding a previously-listed `PageListSnapshot` swap it for `result.layout`
 * and re-render.
 */
export interface PageMoveResult<C extends Coordinates = PageCoordinates> {
  /** The new page order + geometry — what a move changes. */
  layout: PageListSnapshot<C>;
  meta: MutationMeta;
}
