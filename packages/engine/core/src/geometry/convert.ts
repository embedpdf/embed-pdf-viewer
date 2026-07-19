/**
 * PDF-space-internal geometry helpers.
 *
 * These operate ENTIRELY within PDF user space (y-up, edges). They never
 * produce viewer-local (y-down) geometry — that conversion needs the crop box
 * plus rotation/scale and lives in the v3 viewer layer (the `Mat2D` matrix
 * model), never here.
 */

import type { PdfPoint, PdfQuad, PdfRect, PdfSize } from './primitives';

/** Origin + size form of a `PdfRect`, still y-up (origin = bottom-left). */
export interface PdfOriginSize {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Normalize a `PdfRect` to the y-up invariant (`left <= right`, `bottom <= top`),
 * regardless of how the PDF ordered the corners (a `/Rect` array or `FS_RECTF`
 * may carry them in any order). THE enforcement point for the "PdfRect is always
 * normalized" rule: every producer that reads a raw box from PDFium passes it
 * through here, so the invariant holds once, centrally — downstream `width =
 * right - left` is never negative.
 */
export function normalizePdfRect(r: PdfRect): PdfRect {
  return {
    left: Math.min(r.left, r.right),
    right: Math.max(r.left, r.right),
    bottom: Math.min(r.top, r.bottom),
    top: Math.max(r.top, r.bottom),
  };
}

export function pdfRectWidth(r: PdfRect): number {
  return r.right - r.left;
}

export function pdfRectHeight(r: PdfRect): number {
  return r.top - r.bottom;
}

export function pdfRectSize(r: PdfRect): PdfSize {
  return { width: r.right - r.left, height: r.top - r.bottom };
}

/** Convert edges -> origin+size, staying y-up (origin at bottom-left). */
export function pdfRectToOriginSize(r: PdfRect): PdfOriginSize {
  return { x: r.left, y: r.bottom, width: r.right - r.left, height: r.top - r.bottom };
}

/** Convert y-up origin+size back to edges. */
export function pdfRectFromOriginSize(o: PdfOriginSize): PdfRect {
  return { left: o.x, bottom: o.y, right: o.x + o.width, top: o.y + o.height };
}

/**
 * Enclosing axis-aligned box of a quad, in PDF user space. Orientation
 * agnostic (correct for rotated/skewed quads) — this is what highlight
 * rendering and hit-testing want.
 */
export function pdfQuadBounds(q: PdfQuad): PdfRect {
  const xs = [q.p1.x, q.p2.x, q.p3.x, q.p4.x];
  const ys = [q.p1.y, q.p2.y, q.p3.y, q.p4.y];
  return {
    left: Math.min(...xs),
    right: Math.max(...xs),
    bottom: Math.min(...ys),
    top: Math.max(...ys),
  };
}

/** Named corners of a quad, in PDF user space (y-up). */
export interface PdfQuadCorners {
  topLeft: PdfPoint;
  topRight: PdfPoint;
  bottomLeft: PdfPoint;
  bottomRight: PdfPoint;
}

/**
 * Axis-aligned named-corner interpretation of a quad.
 *
 * VALID ONLY for upright (non-rotated, non-skewed) quads: it is derived from
 * the enclosing bounds, so for rotated/skewed quads it returns the bounding
 * box corners, not the true geometric corners. For arbitrary quads use the
 * positional `p1..p4` or `pdfQuadBounds` directly.
 */
export function pdfQuadCorners(q: PdfQuad): PdfQuadCorners {
  const b = pdfQuadBounds(q);
  return {
    topLeft: { x: b.left, y: b.top },
    topRight: { x: b.right, y: b.top },
    bottomLeft: { x: b.left, y: b.bottom },
    bottomRight: { x: b.right, y: b.bottom },
  };
}

/**
 * Build a quad from named corners, in PDFium `FS_QUADPOINTSF` slot order
 * (`p1 = topLeft`, `p2 = topRight`, `p3 = bottomLeft`, `p4 = bottomRight`).
 * The inverse of `pdfQuadCorners` for upright quads.
 */
export function pdfQuadFromCorners(c: PdfQuadCorners): PdfQuad {
  return { p1: c.topLeft, p2: c.topRight, p3: c.bottomLeft, p4: c.bottomRight };
}
