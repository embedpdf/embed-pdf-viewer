/**
 * PDF indirect object number for a page.
 *
 * Resolved via the PDFium runtime helper `EPDFPage_GetObjectNumber(pagePtr)`.
 * Always > 0 for well-formed PDFs. This replaces the v2 page index as the
 * primary addressing key. The page index is kept on `PageHandle` as display
 * metadata only, because it can shift when pages are inserted, deleted, or
 * reordered while a session is open.
 */
export type PageObjectNumber = number;

/**
 * Type guard for the rare malformed-PDF case where a page is a direct
 * object. The engine treats `0` as malformed and throws `EngineError(NotFound)`
 * before any page-level operation.
 */
export function isValidPageObjectNumber(value: unknown): value is PageObjectNumber {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}
