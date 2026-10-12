/**
 * PDF-space-internal geometry helpers.
 *
 * These operate entirely within PDF user space (y-up, edges). They never
 * produce viewer-local (y-down) geometry — that conversion needs the crop box
 * plus rotation/scale and lives in the viewer layer (the `Mat2D` matrix
 * model), never here.
 */

import type { PdfPoint, PdfQuad, PdfRect, PdfRotation, PdfSize } from './primitives';

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
 * may carry them in any order). The enforcement point for the "PdfRect is always
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
  const xs = [q.upperLeft.x, q.upperRight.x, q.lowerLeft.x, q.lowerRight.x];
  const ys = [q.upperLeft.y, q.upperRight.y, q.lowerLeft.y, q.lowerRight.y];
  return {
    left: Math.min(...xs),
    right: Math.max(...xs),
    bottom: Math.min(...ys),
    top: Math.max(...ys),
  };
}

/** A `/QuadPoints` entry's four points, in the order the file gives them. */
export type PdfQuadPoints = readonly [PdfPoint, PdfPoint, PdfPoint, PdfPoint];

const QUAD_EPSILON = 1e-6;

const isFinitePoint = (point: PdfPoint) => Number.isFinite(point.x) && Number.isFinite(point.y);

/** Whether the four points, read as upper-left, upper-right, lower-left, lower-right, make a quad. */
function isZigzagQuad([ul, ur, ll, lr]: PdfQuadPoints): boolean {
  if (![ul, ur, ll, lr].every(isFinitePoint)) return false;
  const upper = { x: ur.x - ul.x, y: ur.y - ul.y };
  const lower = { x: lr.x - ll.x, y: lr.y - ll.y };
  const left = { x: ll.x - ul.x, y: ll.y - ul.y };
  const right = { x: lr.x - ur.x, y: lr.y - ur.y };
  const lengths = [upper, lower, left, right].map((edge) => Math.hypot(edge.x, edge.y));
  if (lengths.some((length) => length <= QUAD_EPSILON)) return false;
  // Opposite edges run the same way: a crossed or reversed order fails here.
  if (upper.x * lower.x + upper.y * lower.y <= 0) return false;
  if (left.x * right.x + left.y * right.y <= 0) return false;
  // Both ends have area and turn the same way.
  const leftArea = upper.x * left.y - upper.y * left.x;
  const rightArea = lower.x * right.y - lower.y * right.x;
  if (Math.abs(leftArea) <= QUAD_EPSILON * lengths[0] * lengths[2]) return false;
  if (Math.abs(rightArea) <= QUAD_EPSILON * lengths[1] * lengths[3]) return false;
  return Math.sign(leftArea) === Math.sign(rightArea);
}

/**
 * Name the corners of a `/QuadPoints` entry. Writers disagree on the order,
 * so every quad read from a file passes through here, and the corner names
 * hold once, centrally:
 *
 *   1. the order Acrobat writes and reads (upper-left, upper-right,
 *      lower-left, lower-right) is kept, turned quads included;
 *   2. the ring order some writers use (upper-left, upper-right, lower-right,
 *      lower-left) is repaired;
 *   3. anything else is named from its shape: the corners go round their
 *      middle, the edge highest on the page (largest y) is the upper one, and
 *      its end with the smaller x is the left. Which side of a quad is up
 *      cannot be told from four points alone; this rule decides it.
 *
 * A misnamed quad can move an underline to the wrong edge, never cross it.
 */
export function normalizePdfQuad(points: PdfQuadPoints): PdfQuad {
  const [first, second, third, fourth] = points;
  if (isZigzagQuad(points)) {
    return { upperLeft: first, upperRight: second, lowerLeft: third, lowerRight: fourth };
  }
  if (isZigzagQuad([first, second, fourth, third])) {
    return { upperLeft: first, upperRight: second, lowerLeft: fourth, lowerRight: third };
  }

  const finite = points.map((point) => (isFinitePoint(point) ? point : { x: 0, y: 0 }));
  const cx = finite.reduce((sum, point) => sum + point.x, 0) / 4;
  const cy = finite.reduce((sum, point) => sum + point.y, 0) / 4;
  const ring = [...finite].sort(
    (a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx),
  );
  let upper = 0;
  for (let i = 1; i < 4; i++) {
    if (ring[i].y + ring[(i + 1) % 4].y > ring[upper].y + ring[(upper + 1) % 4].y) upper = i;
  }
  // Round the ring: upperEnds[0], upperEnds[1], lowerEnds[1], lowerEnds[0].
  const upperEnds = [ring[upper], ring[(upper + 1) % 4]];
  const lowerEnds = [ring[(upper + 3) % 4], ring[(upper + 2) % 4]];
  const leftFirst = upperEnds[0].x <= upperEnds[1].x;
  return leftFirst
    ? {
        upperLeft: upperEnds[0],
        upperRight: upperEnds[1],
        lowerLeft: lowerEnds[0],
        lowerRight: lowerEnds[1],
      }
    : {
        upperLeft: upperEnds[1],
        upperRight: upperEnds[0],
        lowerLeft: lowerEnds[1],
        lowerRight: lowerEnds[0],
      };
}

/**
 * The upright box around `rect` turned by `degrees` about its middle, either
 * way: the `/Rect` of a turned box. A quarter turn is exact: the sides swap.
 */
export function pdfRectTurnedBounds(rect: PdfRect, degrees: number): PdfRect {
  const quarterTurn = quarterTurnOf(degrees);
  if (quarterTurn !== null) return pdfQuarterTurnBox(rect, quarterTurn);
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.abs(Math.cos(radians));
  const sin = Math.abs(Math.sin(radians));
  const width = rect.right - rect.left;
  const height = rect.top - rect.bottom;
  const halfAcross = (width * cos + height * sin) / 2;
  const halfUp = (width * sin + height * cos) / 2;
  const x = (rect.left + rect.right) / 2;
  const y = (rect.bottom + rect.top) / 2;
  return { left: x - halfAcross, bottom: y - halfUp, right: x + halfAcross, top: y + halfUp };
}

/**
 * `degrees` as a quarter turn (clockwise, 0 to 270), or `null` when it isn't
 * one. A negative turn, or one past a whole turn, is the same turn.
 */
export function quarterTurnOf(degrees: number): PdfRotation | null {
  const turn = ((degrees % 360) + 360) % 360;
  return turn % 90 === 0 ? (turn as PdfRotation) : null;
}

/**
 * The box that, turned `rotation` about its middle, stands upright in
 * `rect`: `rect` itself, its sides swapped under 90 and 270. The inverse of
 * {@link pdfRectTurnedBounds} for a quarter turn, which is the one turn a
 * rect pins a box down for.
 */
export function pdfQuarterTurnBox(rect: PdfRect, rotation: PdfRotation): PdfRect {
  if (rotation === 0 || rotation === 180) return rect;
  const x = (rect.left + rect.right) / 2;
  const y = (rect.bottom + rect.top) / 2;
  const halfWidth = (rect.top - rect.bottom) / 2;
  const halfHeight = (rect.right - rect.left) / 2;
  return { left: x - halfWidth, bottom: y - halfHeight, right: x + halfWidth, top: y + halfHeight };
}

/**
 * The area two normalized rects share, or `null` when they share none. Keys
 * in `normalizePdfRect`'s order, so a rect reads the same whichever made it.
 */
export function pdfRectIntersection(rect: PdfRect, other: PdfRect): PdfRect | null {
  const left = Math.max(rect.left, other.left);
  const right = Math.min(rect.right, other.right);
  const bottom = Math.max(rect.bottom, other.bottom);
  const top = Math.min(rect.top, other.top);
  return left < right && bottom < top ? { left, right, bottom, top } : null;
}

/**
 * Whether two rects are the same within what a file's numbers hold: Acrobat
 * writes three decimals, and a rect the engine writes is floats.
 */
export function isSamePdfRect(rect: PdfRect, other: PdfRect): boolean {
  const size = Math.max(
    rect.right - rect.left,
    rect.top - rect.bottom,
    other.right - other.left,
    other.top - other.bottom,
  );
  const tolerance = 0.01 + 1e-4 * size;
  return (
    Math.abs(rect.left - other.left) <= tolerance &&
    Math.abs(rect.bottom - other.bottom) <= tolerance &&
    Math.abs(rect.right - other.right) <= tolerance &&
    Math.abs(rect.top - other.top) <= tolerance
  );
}
