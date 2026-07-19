import type { PageStructureCache } from './PageStructureCache';
import type { PageListSnapshot } from '../dto/PageListSnapshot';
import type { PageObjectNumber } from '../identity/PageObjectNumber';

/**
 * Result of a `pages.insert()`. The inserted pages are COPIES of the source
 * document's pages: they get fresh, never-recycled object numbers in the
 * destination, listed here in insertion order. Every pre-existing page keeps
 * its identity and `RevisionToken` — an insert never invalidates refs on its
 * neighbours (same rule as `pages.move`).
 */
export interface PageInsertResult {
  /** The new pages' object numbers, in the order they were inserted. */
  insertedPageObjectNumbers: PageObjectNumber[];
  /** The new layout — every page in display order. */
  layout: PageListSnapshot;
  /** Cloud-only manifest coherence pins; `null` for local engines. */
  cache: PageStructureCache | null;
}
