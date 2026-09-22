import type { RevisionToken } from './RevisionToken';
import type { WeakAnnotationState } from './WeakAnnotationState';
import type { PageRef } from '../identity/PageRef';

/**
 * Per-page liveness envelope returned with annotation reads and mutation
 * metadata. Deliberately scoped to annotation liveness: page identity,
 * weak-ref revision state, and explicit knowledge about weak annotations.
 *
 * Geometry/display order is NOT here — it lives in `PageLayout` (returned by
 * `pages.list()`), joined to this by `page`. The two change on
 * different cadences (annotation edits vs. structural ops), so they are kept
 * orthogonal and never merged into one struct.
 */
export interface PageState {
  page: PageRef;
  revision: RevisionToken;
  /**
   * Explicit knowledge state for the weak-annotation scan. `unknown` means the
   * page has not been scanned yet; it must not be published as a CDN/cache
   * boolean.
   */
  weakAnnotationState: WeakAnnotationState;
}
