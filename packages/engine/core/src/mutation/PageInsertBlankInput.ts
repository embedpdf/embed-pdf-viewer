import type { PdfSize } from '../geometry/primitives';

/**
 * Upper bound on `count` for a single `pages.insertBlank()` call. A CONTRACT
 * cap, enforced identically by every engine (the cloud input schema carries
 * the same number), so a UI never discovers a lower server limit by surprise.
 * Larger batches are a loop at the call site.
 */
export const PAGE_INSERT_BLANK_MAX_COUNT = 100;

/**
 * Spec for `pages.insertBlank()`: create `count` blank pages of `size`.
 *
 * `size` is explicit and in PDF points, un-rotated — the same convention as
 * `PageLayout.size`. The "match my neighbour" default developers expect is a
 * registry read, so it lives in the page-edit capability, not here: the
 * engine wire never guesses (the `rotateBy` law).
 */
export interface PageInsertBlankSpec {
  /** Page size in PDF points. Both dimensions must be finite and > 0. */
  size: PdfSize;
  /** Pages to create, in `[1, PAGE_INSERT_BLANK_MAX_COUNT]`. Default 1. */
  count?: number;
}
