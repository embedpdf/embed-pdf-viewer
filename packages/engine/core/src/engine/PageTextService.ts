import type { PageTextSnapshot } from '../dto/PageTextSnapshot';
import type { AbortablePromise } from '../promise/AbortablePromise';

/**
 * Per-page text service exposed via `PageHandle.text`.
 *
 * `read()` acquires a `pagePtr` on the worker, runs PDFium's
 * `FPDFText_LoadPage` → `FPDFText_GetText` chain, and returns the
 * full plain-text extraction together with the current `PageState`.
 *
 * The single-method shape is intentional: future per-character
 * features (bounding boxes, font runs, search) land on this service
 * as additional methods without changing the existing URL or DTO.
 */
export interface PageTextService {
  read(): AbortablePromise<PageTextSnapshot>;
}
