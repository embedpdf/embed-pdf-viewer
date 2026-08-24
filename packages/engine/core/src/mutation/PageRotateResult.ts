import type { PageStructureCache } from './PageStructureCache';
import type { PageListSnapshot } from '../dto/PageListSnapshot';

/**
 * Result of a `pages.rotate()`. Rotation is PRESENTATION METADATA: pages are
 * always loaded normalized (rotation forced to 0 — see `PagePtrPool`), so
 * render/text/geometry/annotation coordinates are rotation-independent and
 * every cached render stays byte-valid across a rotate. Nothing per-page is
 * invalidated and no `RevisionToken` bumps — like a move, the op returns the
 * new `layout` (each page's `rotation` field carries the value) and the
 * viewer re-applies its display transform.
 */
export interface PageRotateResult {
  /** The new layout — same pages, same order, new `rotation` values. */
  layout: PageListSnapshot;
  /** Cloud-only manifest coherence pins; `null` for local engines. */
  cache: PageStructureCache | null;
}
