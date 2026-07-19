import type { PageObjectNumber } from '@embedpdf/engine-core/runtime';

/**
 * Record of one page within a `DocumentSession`. Built lazily by
 * `DocumentSession.ensurePageRegistry()`; the registry is only forced
 * to populate fully when a path that needs `pageIndex -> pageObjectNumber`
 * for the whole document is invoked (most notably `listRawAll()`).
 *
 * Carries no `pagePtr`. Lifetime of the actual PDFium page handle is owned
 * by the `PagePtrPool`; the page record is metadata only.
 */
export interface PageRecord {
  pageObjectNumber: PageObjectNumber;
  pageIndex: number;
}
