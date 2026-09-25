import type { MutationMeta } from './MutationMeta';
import type { PageFlattenUsage } from './PageFlattenResult';
import type { AnnotationRef } from '../identity/AnnotationRef';
import type { PageRef } from '../identity/PageRef';

/** Input for `page(pon).annotations.flatten()`: the refs (all on that page). */
export interface AnnotationFlattenInput {
  refs: AnnotationRef[];
  usage: PageFlattenUsage;
}

/**
 * Per-ref outcome. `applied`: painted into the page content and removed.
 * `unchanged`: left in place — hidden for the usage, a Popup, or without a
 * usable normal appearance. A ref that is not on the page rejects the whole
 * call with `InvalidArg` before anything is mutated, so it never appears here.
 */
export interface AnnotationFlattenItemResult {
  ref: AnnotationRef;
  status: 'applied' | 'unchanged';
}

/**
 * Result of `page(pon).annotations.flatten()` — `pages.flatten` for a chosen
 * set. A content + annotation mutation of one page: `meta` carries that
 * page's new pins (null when nothing was applied), exactly like
 * `PageFlattenResult`.
 */
export interface AnnotationFlattenResult {
  page: PageRef;
  usage: PageFlattenUsage;
  results: AnnotationFlattenItemResult[];
  meta: MutationMeta | null;
}

/** Input for `page(pon).annotations.exportAppearance()`. */
export interface AnnotationAppearanceExportInput {
  refs: AnnotationRef[];
}
