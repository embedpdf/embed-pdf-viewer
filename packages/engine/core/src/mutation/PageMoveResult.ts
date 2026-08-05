import type { PageStructureCache } from './PageStructureCache';
import type { PageListSnapshot } from '../dto/PageListSnapshot';

/** A move's coherence pins are the shared structure-op shape — see
 *  {@link PageStructureCache} for the semantics. */
export type PageMoveCache = PageStructureCache;

/**
 * Result of a `pages.move()`. Page reorder is intentionally **outside** the
 * per-page revision/weak-ref model, so a move returns geometry, not liveness:
 *
 *   - Pages are always identified by `pageObjectNumber`; there is no "weak
 *     page ref", so no revision needs bumping to invalidate caller state.
 *   - Per-page `RevisionToken`s are NOT bumped on a move — each page's
 *     /Annots array is untouched, so weak `AnnotationRef.kind === 'index'`
 *     references survive a reorder. (That liveness invariant is verified by
 *     the annotation conformance suite, not here.)
 *
 * What a move actually changes is the page order + geometry, so the result
 * returns the new `layout` (the same shape `pages.list()` returns). Callers
 * holding a previously-listed `PageListSnapshot` swap it for `result.layout`
 * and re-render.
 */
export interface PageMoveResult {
  /** The new page order + geometry — what a move changes. */
  layout: PageListSnapshot;
  /** Cloud-only manifest coherence pins; `null` for local engines. */
  cache: PageMoveCache | null;
}
