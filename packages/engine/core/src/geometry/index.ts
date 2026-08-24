/**
 * Zod-free barrel for engine PDF-document geometry: primitive types plus
 * PDF-space-internal helpers. Re-exported via `shared.ts` (=> `/runtime`).
 *
 * Zod schemas live in `./schemas` and are exported from `wire.ts` ONLY, so
 * importing geometry into the runtime never pulls in zod.
 */

export type {
  PdfPoint,
  PdfRect,
  PdfSize,
  PdfQuad,
  PdfRotation,
  LinePoints,
  InkStroke,
  InkList,
  CalloutLine,
} from './primitives';
export type { PdfOriginSize, PdfQuadCorners } from './convert';
export {
  normalizePdfRect,
  pdfRectWidth,
  pdfRectHeight,
  pdfRectSize,
  pdfRectToOriginSize,
  pdfRectFromOriginSize,
  pdfQuadBounds,
  pdfQuadCorners,
  pdfQuadFromCorners,
} from './convert';
