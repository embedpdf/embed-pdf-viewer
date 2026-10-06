import type { MutationMeta } from './MutationMeta';
import type { PageListSnapshot } from '../dto/PageListSnapshot';
import type { Coordinates, PageCoordinates } from '../pageSpace/coordinates';

/**
 * Result of a `pages.delete()`. A deleted page's object number is retired —
 * the engine nulls the page object rather than freeing the number, so a page object number
 * can never be silently recycled onto an unrelated future page. The page's
 * annotations are gone with it; every surviving page keeps its identity, and
 * its annotations their names.
 *
 * The result returns the post-delete `layout`; callers swap their snapshot
 * and drop any per-page state they hold for the deleted page object numbers.
 */
export interface PageDeleteResult<C extends Coordinates = PageCoordinates> {
  /** The new layout — the surviving pages in display order. */
  layout: PageListSnapshot<C>;
  meta: MutationMeta;
}
