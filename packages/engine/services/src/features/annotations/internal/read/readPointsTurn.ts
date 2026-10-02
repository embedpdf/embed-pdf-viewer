import {
  isSamePdfRect,
  normalizePdfRect,
  pdfPointsBounds,
  pdfPointUnturned,
  PdfAnnotationSubtypeCode,
  type PdfPoint,
  type PdfPointTurn,
  type PdfRect,
} from '@embedpdf/engine-core/runtime';
import type { PdfFunctions, PdfRuntimeMemory, Ptr } from '@embedpdf/engine-runtime';

import { readInkList, readLine, readVertices } from './annotationReadPrimitives';
import { readAnnotationRotation } from './readAnnotationTransformMetadata';
import { withScratch } from '../../../../runtime/memory/scratch';
import { RECTF_BYTES, readRectF } from '../../../../runtime/memory/structs';

/**
 * The turn of a kind drawn from points: line, polyline, polygon, ink. The
 * file keeps the points as drawn, as every PDF app reads them; our
 * `/EMBD_Metadata` keys keep the turn (`Rotation`) and the box around the
 * upright points (`UnrotatedRect`), which it turns about the middle of. The
 * keys hold while the drawn points, turned back, have the recorded box:
 * another app that moves or redraws the points leaves them behind, and the
 * annotation then reads upright, its points as drawn.
 */

/** The points as the file draws them: one set for a line or a polygon, one per ink stroke. */
export function readDrawnPointSets(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
): PdfPoint[][] {
  switch (fn.FPDFAnnot_GetSubtype(annotPtr)) {
    case PdfAnnotationSubtypeCode.LINE: {
      const line = readLine(fn, mem, annotPtr);
      return line ? [[line.start, line.end]] : [];
    }
    case PdfAnnotationSubtypeCode.POLYGON:
    case PdfAnnotationSubtypeCode.POLYLINE:
      return [readVertices(fn, mem, annotPtr)];
    case PdfAnnotationSubtypeCode.INK:
      return readInkList(fn, mem, annotPtr).map((stroke) => [...stroke]);
    default:
      return [];
  }
}

/** Our keys as written: the turn (degrees clockwise) and the upright points' box. */
function readRecordedPointsTurn(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
): { rotation: number; box: PdfRect } | undefined {
  const rotation = readAnnotationRotation(fn, mem, annotPtr);
  if (rotation === undefined) return undefined;
  const box = withScratch(mem, RECTF_BYTES, (buf) =>
    fn.EPDFAnnot_GetEmbedMetadataRect(annotPtr, 'UnrotatedRect', buf)
      ? normalizePdfRect(readRectF(mem, buf))
      : undefined,
  );
  return box ? { rotation, box } : undefined;
}

/** The turn `drawn` was made with, while our keys still describe it; `undefined` upright. */
export function readPointsTurn(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  drawn: readonly (readonly PdfPoint[])[],
): PdfPointTurn | undefined {
  const points = drawn.flat();
  if (points.length === 0) return undefined;
  const recorded = readRecordedPointsTurn(fn, mem, annotPtr);
  if (!recorded) return undefined;
  const { box } = recorded;
  const turn: PdfPointTurn = {
    degrees: recorded.rotation,
    center: { x: (box.left + box.right) / 2, y: (box.bottom + box.top) / 2 },
  };
  const upright = points.map((point) => pdfPointUnturned(point, turn));
  return isSamePdfRect(pdfPointsBounds(upright), box) ? turn : undefined;
}

/** `point` as upright, turned back by `turn` when there is one. */
export const uprightPoint = (point: PdfPoint, turn: PdfPointTurn | undefined): PdfPoint =>
  turn ? pdfPointUnturned(point, turn) : point;
