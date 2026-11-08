import type { MutationMeta } from './MutationMeta';
import type { PageListSnapshot } from '../dto/PageListSnapshot';
import type { PageRef } from '../identity/PageRef';
import type { Coordinates, PageCoordinates } from '../pageSpace/coordinates';

/**
 * Result of a scale change. It changes no page pixels or annotation indices;
 * like a rotate, it returns the new `layout`, whose pages carry their
 * viewports.
 */
export interface PageScaleResult<C extends Coordinates = PageCoordinates> {
  /** The page whose scale was set; for several, the first. The change's `pages` names them all. */
  page: PageRef;
  /** The new layout: same pages, same order, new `viewports`. */
  layout: PageListSnapshot<C>;
  meta: MutationMeta;
}
