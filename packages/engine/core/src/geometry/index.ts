/**
 * Zod-free barrel for engine PDF-document geometry: primitive types plus
 * PDF-space-internal helpers. Re-exported via `shared.ts` (=> `/runtime`).
 *
 * Zod schemas live in `./schemas` and are exported from `wire.ts` only, so
 * importing geometry into the runtime never pulls in zod.
 */

export type {
  PdfPoint,
  PdfRect,
  PdfTopLeft,
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
  pdfRectTurnedBounds,
  isSamePdfRect,
} from './convert';
export type { PdfPointTurn } from './pointTurn';
export {
  pdfPointsBounds,
  pdfPointTurned,
  pdfPointUnturned,
  pdfTurnOfDrawn,
  pdfTurnOfUpright,
} from './pointTurn';
export { renderSize } from './renderSize';
