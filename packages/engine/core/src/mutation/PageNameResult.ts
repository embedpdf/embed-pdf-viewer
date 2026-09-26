import type { MutationMeta } from './MutationMeta';
import type { PageListSnapshot } from '../dto/PageListSnapshot';

/**
 * Result of `pages.setName()` / `pages.removeName()`. Named pages are
 * layout: the post-mutation snapshot (with `namedPages`) is returned whole,
 * and the cloud's `meta.cacheDelta` says `docVersion` + `layoutVersion`
 * advanced — per-page content/annotation pins never move (same shape as
 * `PageMoveResult` on purpose).
 */
export interface PageNameResult {
  layout: PageListSnapshot;
  meta: MutationMeta;
}
