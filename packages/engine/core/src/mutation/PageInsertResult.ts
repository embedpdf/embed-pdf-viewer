import type { MutationMeta } from './MutationMeta';
import type { PageListSnapshot } from '../dto/PageListSnapshot';
import type { PageRef } from '../identity/PageRef';

/**
 * Result of a `pages.insert()`. The inserted pages are copies of the source
 * document's pages: they get fresh, never-recycled object numbers in the
 * destination, listed here in insertion order. Every pre-existing page keeps
 * its identity and `RevisionToken` — an insert never invalidates refs on its
 * neighbours (same rule as `pages.move`).
 */
export interface PageInsertResult {
  /** The new pages, in the order they were inserted. */
  insertedPages: PageRef[];
  /** The new layout — every page in display order. */
  layout: PageListSnapshot;
  meta: MutationMeta;
}
