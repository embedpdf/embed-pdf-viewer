import type { MutationMeta } from './MutationMeta';
import type { PageListSnapshot } from '../dto/PageListSnapshot';
import type { PageRef } from '../identity/PageRef';
import type { Coordinates, PageCoordinates } from '../pageSpace/coordinates';

/**
 * Result of a `pages.reorder()`. Pages are always identified by their refs,
 * and each page's /Annots is untouched, so every ref a caller holds survives
 * a reorder.
 *
 * What a reorder changes is the page order, so the result returns the new
 * `layout` whole (the same shape `pages.list()` returns): callers swap their
 * snapshot for it.
 */
export interface PageReorderResult<C extends Coordinates = PageCoordinates> {
  /** The pages that moved, in their new order. */
  pages: PageRef[];
  /** The new page order and geometry. */
  layout: PageListSnapshot<C>;
  meta: MutationMeta;
}
