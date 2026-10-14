import { normalizePdfRect, semanticEqual, type PdfPoint } from '@embedpdf/engine-core/runtime';
import type { PdfFunctions, PdfRuntimeMemory, Ptr } from '@embedpdf/engine-runtime';

import { setAnnotRect } from './annotationWritePrimitives';
import { readAnnotRect } from '../read/annotationReadPrimitives';

/**
 * A drawing that only moved keeps its `/Rect`, moved the same way: an
 * appearance that isn't drawn again moves with it, and a rect another app
 * worked out (its own padding) stays as that app made it.
 */

/** A shift of every point by the same amount. */
export interface PointShift {
  dx: number;
  dy: number;
}

/** How far `after` is `before` shifted, when every point moved the same way. */
export function shiftBetween(
  before: readonly PdfPoint[],
  after: readonly PdfPoint[],
): PointShift | undefined {
  if (before.length === 0 || before.length !== after.length) return undefined;
  const dx = after[0]!.x - before[0]!.x;
  const dy = after[0]!.y - before[0]!.y;
  return before.every((point, i) =>
    semanticEqual({ x: point.x + dx, y: point.y + dy }, { x: after[i]!.x, y: after[i]!.y }),
  )
    ? { dx, dy }
    : undefined;
}

/** Move `/Rect` by `shift`. */
export function shiftAnnotRect(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  { dx, dy }: PointShift,
): void {
  const rect = normalizePdfRect(readAnnotRect(fn, mem, annotPtr));
  setAnnotRect(fn, mem, annotPtr, {
    left: rect.left + dx,
    bottom: rect.bottom + dy,
    right: rect.right + dx,
    top: rect.top + dy,
  });
}
