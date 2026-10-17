import type { MutationMeta } from './MutationMeta';
import type { PageListSnapshot } from '../dto/PageListSnapshot';
import type { Coordinates, PageCoordinates } from '../pageSpace/coordinates';

/**
 * Result of `pages.setName()` / `pages.removeName()`. Named pages are
 * layout: the post-mutation snapshot (with `namedPages`) is returned whole,
 * and the cloud's `meta.cacheDelta` says `docVersion` + `layoutVersion`
 * advanced — per-page content/annotation pins never move (same shape as
 * `PageReorderResult` on purpose).
 */
export interface PageNameResult<C extends Coordinates = PageCoordinates> {
  layout: PageListSnapshot<C>;
  meta: MutationMeta;
}
