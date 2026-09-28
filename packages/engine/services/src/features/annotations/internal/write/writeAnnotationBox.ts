import {
  normalizePdfRect,
  pdfRectTurnedBounds,
  semanticEqual,
  type PdfRect,
} from '@embedpdf/engine-core/runtime';
import type { PdfFunctions, PdfRuntimeMemory, Ptr } from '@embedpdf/engine-runtime';

import { clearRectangleDifferences, setAnnotRect } from './annotationWritePrimitives';
import { shiftAnnotRect } from './shiftAnnotRect';
import { writeRecordedTurn } from './writeAnnotationTransformMetadata';
import { readAnnotationBox, type AnnotationBox } from '../read/readAnnotationTurn';

/**
 * A box kind's geometry (square, circle, free text, stamp, caret): its `box`
 * and its turn. `/Rect` is where the shape sits until its appearance is
 * drawn: the box, or the upright box around it turned. Drawing the
 * appearance takes in what the drawing adds around the shape (a cloudy
 * border's bumps, a callout's line) and writes `/RD`; a stamp's placement
 * fits its drawing inside the box.
 */

/** The turn as the file keeps it: a turn of 0 is none. */
const turnOf = (rotation: number | null | undefined): number | null => rotation || null;

const normalizeDegrees = (degrees: number): number => ((degrees % 360) + 360) % 360;

function isSameRotation(rotation: number | null, other: number | null): boolean {
  if (rotation === null || other === null) return rotation === other;
  return semanticEqual(normalizeDegrees(rotation), normalizeDegrees(other));
}

/** Write `geometry` whole: the turn in our keys (and `/Rotate`), `/Rect`, and no `/RD`. */
export function writeAnnotationBox(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  geometry: AnnotationBox,
): void {
  const box = normalizePdfRect(geometry.box);
  const rotation = turnOf(geometry.rotation);
  writeRecordedTurn(fn, mem, annotPtr, rotation === null ? null : { rotation, box });
  setAnnotRect(fn, mem, annotPtr, rotation === null ? box : pdfRectTurnedBounds(box, rotation));
  clearRectangleDifferences(fn, annotPtr);
}

/**
 * An update's `box` and `rotation`, each kept when left out (`rotation:
 * null` straightens the box where it is). A move of the box by the same turn
 * shifts `/Rect` and keeps `/RD`: an appearance that isn't drawn again moves
 * with it, and one that is finds its shape where it was sent. Returns
 * whether the geometry changed.
 */
export function applyAnnotationBoxPatch(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  patch: { box?: PdfRect; rotation?: number | null },
): boolean {
  if (patch.box === undefined && patch.rotation === undefined) return false;
  const current = readAnnotationBox(fn, mem, annotPtr);
  const box = normalizePdfRect(patch.box ?? current.box);
  const rotation = patch.rotation === undefined ? current.rotation : turnOf(patch.rotation);
  const turned = isSameRotation(rotation, current.rotation);
  if (turned && semanticEqual(box, current.box)) return false;

  const width = box.right - box.left;
  const height = box.top - box.bottom;
  const moved =
    turned &&
    semanticEqual(width, current.box.right - current.box.left) &&
    semanticEqual(height, current.box.top - current.box.bottom);
  if (!moved) {
    writeAnnotationBox(fn, mem, annotPtr, { box, rotation });
    return true;
  }
  shiftAnnotRect(fn, mem, annotPtr, {
    dx: box.left - current.box.left,
    dy: box.bottom - current.box.bottom,
  });
  if (rotation !== null) writeRecordedTurn(fn, mem, annotPtr, { rotation, box });
  return true;
}
