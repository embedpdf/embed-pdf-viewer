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
  PdfSize,
  PdfQuad,
  PdfRotation,
  LinePoints,
  InkStroke,
  InkList,
  CalloutLine,
} from './primitives';
export type { PdfOriginSize, PdfQuadPoints } from './convert';
export {
  normalizePdfRect,
  pdfRectWidth,
  pdfRectHeight,
  pdfRectSize,
  pdfRectToOriginSize,
  pdfRectFromOriginSize,
  pdfQuadBounds,
  normalizePdfQuad,
  pdfRectTurnedBounds,
  pdfQuarterTurnBox,
  quarterTurnOf,
  pdfRectIntersection,
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
export type {
  PageRenderMatrix,
  PageRenderTransform,
  PageTransformOptions,
  PixelBox,
  PixelPoint,
  PixelQuad,
} from './pageTransform';
export {
  pageTransform,
  renderAreaTransform,
  renderMatrix,
  renderTargetArea,
  renderTransform,
} from './pageTransform';
export type { WrittenPageBoxes } from './pageBoxes';
export type { PageBox, PagePoint, PageQuad } from './pageSpace';
export { pageBoxOf, pagePointOf, pageQuadOf, pdfPointOf, pdfQuadOf, pdfRectOf } from './pageSpace';
export { DEFAULT_MEDIA_BOX, pageBoxesOf, pageRotationOf } from './pageBoxes';
