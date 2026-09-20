import type { PageStructureCache } from './PageStructureCache';
import type { PageListSnapshot } from '../dto/PageListSnapshot';

/**
 * Result of `pages.setName()` / `pages.removeName()`. Named pages are
 * LAYOUT: the post-mutation snapshot (with `namedPages`) is returned whole,
 * and the cache pins say `docVersion` + `layoutVersion` advanced — per-page
 * content/annotation pins never move (same shape as `PageMoveResult` on
 * purpose). `cache` is null on local engines.
 */
export interface PageNameResult {
  layout: PageListSnapshot;
  cache: PageStructureCache | null;
}
