import type { MutationMeta } from './MutationMeta';
import type { PageFlattenUsage } from './PageFlattenResult';
import type { AnnotationRef } from '../identity/AnnotationRef';
import type { PageObjectNumber } from '../identity/PageObjectNumber';

/** Input for `page(pon).annotations.flatten()`: the refs (all on that page). */
export interface AnnotationFlattenInput {
  refs: AnnotationRef[];
  usage: PageFlattenUsage;
}

/**
 * Per-ref outcome. `applied`: painted into the page content and removed.
 * `skipped`: left in place — hidden for the usage, a Popup, or without a
 * usable normal appearance. A ref that is not on the page rejects the whole
 * call with `InvalidArg` before anything is mutated, so it never appears here.
 */
export interface AnnotationFlattenItemResult {
  ref: AnnotationRef;
  status: 'applied' | 'skipped';
}

/**
 * Result of `page(pon).annotations.flatten()` — `pages.flatten` for a chosen
 * set. A content + annotation mutation of ONE page: `meta` carries that
 * page's new pins (null when nothing was applied), exactly like
 * `PageFlattenResult`.
 */
export interface AnnotationFlattenResult {
  pageObjectNumber: PageObjectNumber;
  usage: PageFlattenUsage;
  results: AnnotationFlattenItemResult[];
  meta: MutationMeta | null;
}

/** Input for `page(pon).annotations.exportAppearance()`. */
export interface AnnotationAppearanceExportInput {
  refs: AnnotationRef[];
}
