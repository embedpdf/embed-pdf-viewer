import type { MutationMeta } from './MutationMeta';
import type { PageListSnapshot } from '../dto/PageListSnapshot';
import type { PageRef } from '../identity/PageRef';
import type { Coordinates, PageCoordinates } from '../pageSpace/coordinates';

/**
 * What an undo of a page delete, or a redo of a page insert, brought back:
 * the same pages, under the same refs, each right after the page it followed
 * while that is still there (else first), with their annotations and names.
 * Only an undo makes one.
 */
export interface PageRestoreResult<C extends Coordinates = PageCoordinates> {
  /** The pages that came back, in display order. */
  pages: PageRef[];
  /** The new layout: every page in display order. */
  layout: PageListSnapshot<C>;
  meta: MutationMeta;
}
