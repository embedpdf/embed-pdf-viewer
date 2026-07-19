import type { PageStructureCache } from './PageStructureCache';
import type { PageListSnapshot } from '../dto/PageListSnapshot';

/**
 * Result of a `pages.delete()`. A deleted page's object number is RETIRED —
 * the engine nulls the page object rather than freeing the number, so a PON
 * can never be silently recycled onto an unrelated future page. The page's
 * annotations are gone with it; every SURVIVING page keeps its identity and
 * its `RevisionToken`, so an index-based annotation ref on an unrelated page
 * survives a neighbour's deletion.
 *
 * The result returns the post-delete `layout`; callers swap their snapshot
 * and drop any per-page state they hold for the deleted PONs.
 */
export interface PageDeleteResult {
  /** The new layout — the surviving pages in display order. */
  layout: PageListSnapshot;
  /** Cloud-only manifest coherence pins; `null` for local engines. */
  cache: PageStructureCache | null;
}
