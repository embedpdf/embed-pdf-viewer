import type { PageTextSnapshot } from '../dto/PageTextSnapshot';
import type { AbortablePromise } from '../promise/AbortablePromise';

/**
 * Per-page text service exposed via `PageHandle.text`.
 *
 * `read()` runs PDFium's `FPDFText_LoadPage` → `FPDFText_GetText` chain on
 * the worker and returns the page's plain text, its character count and
 * the character↔text map. It carries no annotation state (`PageState`):
 * the text changes only with the page's content.
 */
export interface PageTextService {
  get(): AbortablePromise<PageTextSnapshot>;
}
