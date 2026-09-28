import { normalizePdfRect, type PdfRect, type PdfTopLeft } from '@embedpdf/engine-core/runtime';
import type { PdfFunctions, PdfRuntimeMemory, Ptr } from '@embedpdf/engine-runtime';

import { readAnnotRect } from './read/annotationReadPrimitives';
import { setAnnotRect } from './write/annotationWritePrimitives';

/**
 * A note's or a file's icon: a fixed-size symbol the appearance draws from
 * `/Rect`'s left and top edges, the corner PDF keeps in place for an icon
 * that doesn't zoom. The API's `at` is those two edges; drawing the icon sets
 * `/Rect` to the box it paints.
 */

/** The icon's left and top edges. */
export function iconCornerOf(rect: PdfRect): PdfTopLeft {
  const box = normalizePdfRect(rect);
  return { left: box.left, top: box.top };
}

/** A create's `/Rect`: the corner, for the appearance to draw the icon from. */
export function placeIcon(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  at: PdfTopLeft,
): void {
  setAnnotRect(fn, mem, annotPtr, { left: at.left, bottom: at.top, right: at.left, top: at.top });
}

/** An update's corner: `/Rect` moves there whole, so the icon drawn moves with it. */
export function moveIcon(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  at: PdfTopLeft,
): void {
  const rect = normalizePdfRect(readAnnotRect(fn, mem, annotPtr));
  const dx = at.left - rect.left;
  const dy = at.top - rect.top;
  setAnnotRect(fn, mem, annotPtr, {
    left: rect.left + dx,
    bottom: rect.bottom + dy,
    right: rect.right + dx,
    top: rect.top + dy,
  });
}
