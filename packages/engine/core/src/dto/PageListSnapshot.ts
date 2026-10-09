import type { NamedPageEntry } from './NamedPage';
import type { PageLayout } from './PageLayout';
import type { Coordinates, PageCoordinates } from '../pageSpace/coordinates';

/**
 * Read-only snapshot of every page in the open document, ordered by the
 * page's current display `index`. Returned by `pages.list()`.
 *
 * This is a geometry view: each `PageLayout` carries size, rotation,
 * label, userUnit, and the raw PDF boxes — the things a developer expects
 * when listing pages.
 *
 * The container name is kept (consistent with the other `*Snapshot` read
 * DTOs); only the element type changed from a liveness envelope to
 * `PageLayout`.
 */
export interface PageListSnapshot<C extends Coordinates = PageCoordinates> {
  pageCount: number;
  pages: PageLayout<C>[];
  /**
   * The catalog's `/Names /Pages` and `/Names /Templates` registrations, in
   * tree order — see {@link NamedPageEntry}. Empty when there are none.
   */
  namedPages: NamedPageEntry[];
}
