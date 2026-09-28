/**
 * Page space: where things are on a page as you see it. x runs right from the
 * left edge of the page's visible box, y runs down from its top edge, in PDF
 * units, on the page as stored: a page's own turn (`/Rotate`) never changes a
 * number. The visible box is the crop box inside the media box
 * (`pageBoxesOf`).
 *
 * The file keeps PDF user space (y up, its origin wherever the file puts it).
 * These convert between the two given the page's visible box in PDF space.
 * The conversion is a shift and a flip, nothing else, so it is exact: a value
 * read from a file (a 32-bit float) converts and converts back to the same
 * number.
 */

import type { PdfPoint, PdfQuad, PdfRect } from './primitives';

/** A point in page space: x from the visible page's left edge, y down from its top edge. */
export interface PagePoint {
  x: number;
  y: number;
}

/** A box in page space: `x, y` is its top-left corner. */
export interface PageBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Four points in page space, in the order the file gives them. Like
 * `PdfQuad`, it promises no corner meaning: the slots are positional.
 */
export interface PageQuad {
  p1: PagePoint;
  p2: PagePoint;
  p3: PagePoint;
  p4: PagePoint;
}

/** A point in the file's coordinates, in page space. `visible` is the page's visible box. */
export function pagePointOf(point: PdfPoint, visible: PdfRect): PagePoint {
  return { x: point.x - visible.left, y: visible.top - point.y };
}

/** A page-space point in the file's coordinates. */
export function pdfPointOf(point: PagePoint, visible: PdfRect): PdfPoint {
  return { x: point.x + visible.left, y: visible.top - point.y };
}

/** A normalized rect in the file's coordinates, in page space. */
export function pageBoxOf(rect: PdfRect, visible: PdfRect): PageBox {
  return {
    x: rect.left - visible.left,
    y: visible.top - rect.top,
    width: rect.right - rect.left,
    height: rect.top - rect.bottom,
  };
}

/** A page-space box in the file's coordinates, keys in `normalizePdfRect`'s order. */
export function pdfRectOf(box: PageBox, visible: PdfRect): PdfRect {
  const left = box.x + visible.left;
  const top = visible.top - box.y;
  return { left, right: left + box.width, bottom: top - box.height, top };
}

export function pageQuadOf(quad: PdfQuad, visible: PdfRect): PageQuad {
  return {
    p1: pagePointOf(quad.p1, visible),
    p2: pagePointOf(quad.p2, visible),
    p3: pagePointOf(quad.p3, visible),
    p4: pagePointOf(quad.p4, visible),
  };
}

export function pdfQuadOf(quad: PageQuad, visible: PdfRect): PdfQuad {
  return {
    p1: pdfPointOf(quad.p1, visible),
    p2: pdfPointOf(quad.p2, visible),
    p3: pdfPointOf(quad.p3, visible),
    p4: pdfPointOf(quad.p4, visible),
  };
}

// ── mirroring ──
//
// Math written for the file's coordinates (y up) runs unchanged on page-space
// values flipped top to bottom: the flip turns page space into the file's
// coordinates shifted, and none of that math depends on where the origin is.
// Flipping needs no page box and is exact.

/** A page-space point flipped into y-up coordinates. */
export const mirroredPoint = (point: { x: number; y: number }): PdfPoint => ({
  x: point.x,
  y: -point.y,
});

/** A y-up point flipped back into page space. */
export const unmirroredPoint = (point: PdfPoint): PagePoint => ({ x: point.x, y: -point.y });

/** A page-space box flipped into a y-up rect. */
export const mirroredRect = (box: PageBox): PdfRect => ({
  left: box.x,
  right: box.x + box.width,
  bottom: -(box.y + box.height),
  top: -box.y,
});

/** A y-up rect flipped back into a page-space box. */
export const unmirroredBox = (rect: PdfRect): PageBox => ({
  x: rect.left,
  y: -rect.top,
  width: rect.right - rect.left,
  height: rect.top - rect.bottom,
});

export const mirroredQuad = (quad: PageQuad): PdfQuad => ({
  p1: mirroredPoint(quad.p1),
  p2: mirroredPoint(quad.p2),
  p3: mirroredPoint(quad.p3),
  p4: mirroredPoint(quad.p4),
});

export const unmirroredQuad = (quad: PdfQuad): PageQuad => ({
  p1: unmirroredPoint(quad.p1),
  p2: unmirroredPoint(quad.p2),
  p3: unmirroredPoint(quad.p3),
  p4: unmirroredPoint(quad.p4),
});
