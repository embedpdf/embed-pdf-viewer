/**
 * Plain page-space math: rect corners, the eight resize handles, resizing
 * (upright or turned about the middle), turning points about a pivot, and
 * point-in-polygon. No annotation kinds: the shape families and
 * `geometry.ts` share it.
 */
import { applyPoint, rotateAbout, type Mat2D, type PointIn } from '@embedpdf/core-geometry';
import type { Cursor, Point, Rect } from './types';

export const MIN_SIZE = 4;

/* ── rect handles ─────────────────────────────────────────────────────────── */

export type RectHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
export const RECT_HANDLES: RectHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
export const RECT_CURSOR: Record<RectHandle, Cursor> = {
  nw: 'nwse-resize',
  se: 'nwse-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
};
/** Each handle's compass direction (deg CW from north) on the unrotated box. */
const HANDLE_BASE_ANGLE: Record<RectHandle, number> = {
  n: 0,
  ne: 45,
  e: 90,
  se: 135,
  s: 180,
  sw: 225,
  w: 270,
  nw: 315,
};
/** The resize cursor per 45° compass sector (index = sector, 0 = north). */
const SECTOR_CURSORS: Cursor[] = [
  'ns-resize',
  'nesw-resize',
  'ew-resize',
  'nwse-resize',
  'ns-resize',
  'nesw-resize',
  'ew-resize',
  'nwse-resize',
];
/** The resize cursor for a handle on a box tilted by `rot` deg: rotate the
 *  handle's compass direction with the box and pick the nearest 45° sector.
 *  At `rot = 0` this reproduces {@link RECT_CURSOR} exactly. */
export const rotatedHandleCursor = (handle: RectHandle, rot: number): Cursor =>
  SECTOR_CURSORS[Math.round(normalizeDeg(HANDLE_BASE_ANGLE[handle] + rot) / 45) % 8];
/**
 * A resize cursor as it points on screen, on a page shown turned `rotation`
 * degrees clockwise (its display rotation): handles sit in page space, but
 * the cursor follows what the user sees. Any other cursor stays as it is.
 */
export function cursorOnScreen(cursor: Cursor, rotation: number): Cursor {
  const sector = SECTOR_CURSORS.indexOf(cursor);
  if (sector < 0) return cursor;
  return SECTOR_CURSORS[(sector + Math.round(normalizeDeg(rotation) / 45)) % 8]!;
}
const rectEdges = (handle: RectHandle) => ({
  w: handle === 'nw' || handle === 'w' || handle === 'sw',
  e: handle === 'ne' || handle === 'e' || handle === 'se',
  n: handle === 'nw' || handle === 'n' || handle === 'ne',
  s: handle === 'sw' || handle === 's' || handle === 'se',
});
export const rectHandlePoint = (rect: Rect, handle: RectHandle): Point => {
  const edges = rectEdges(handle);
  return {
    x: edges.w ? rect.x : edges.e ? rect.x + rect.width : rect.x + rect.width / 2,
    y: edges.n ? rect.y : edges.s ? rect.y + rect.height : rect.y + rect.height / 2,
  };
};
export function resizeRect(base: Rect, handle: RectHandle, to: Point): Rect {
  const edges = rectEdges(handle);
  let left = base.x;
  let right = base.x + base.width;
  let top = base.y;
  let bottom = base.y + base.height;
  if (edges.w) left = to.x;
  if (edges.e) right = to.x;
  if (edges.n) top = to.y;
  if (edges.s) bottom = to.y;
  return {
    x: Math.min(left, right),
    y: Math.min(top, bottom),
    width: Math.max(MIN_SIZE, Math.abs(right - left)),
    height: Math.max(MIN_SIZE, Math.abs(bottom - top)),
  };
}

/* ── small math ───────────────────────────────────────────────────────────── */

export const rectFromPoints = (from: Point, to: Point): Rect => ({
  x: Math.min(from.x, to.x),
  y: Math.min(from.y, to.y),
  width: Math.abs(to.x - from.x),
  height: Math.abs(to.y - from.y),
});
export const rectsIntersect = (left: Rect, right: Rect): boolean =>
  left.x <= right.x + right.width &&
  left.x + left.width >= right.x &&
  left.y <= right.y + right.height &&
  left.y + left.height >= right.y;
export const rectContains = (rect: Rect, point: Point): boolean =>
  point.x >= rect.x &&
  point.x <= rect.x + rect.width &&
  point.y >= rect.y &&
  point.y <= rect.y + rect.height;

/** Distance from point p to segment ab. */
export function segDist(point: Point, from: Point, to: Point): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len2 = dx * dx + dy * dy;
  const fraction =
    len2 === 0
      ? 0
      : Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.y - from.y) * dy) / len2));
  return Math.hypot(point.x - (from.x + fraction * dx), point.y - (from.y + fraction * dy));
}
/** Distance from `point` to the rect: 0 on or inside it. */
export function pointRectDistance(point: Point, rect: Rect): number {
  const dx = Math.max(rect.x - point.x, 0, point.x - (rect.x + rect.width));
  const dy = Math.max(rect.y - point.y, 0, point.y - (rect.y + rect.height));
  return Math.hypot(dx, dy);
}

/** Does the segment from `from` to `to` pass through the rect (edges included)? Clipped Liang–Barsky style. */
export function segmentCrossesRect(from: Point, to: Point, rect: Rect): boolean {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  // Each side as `step * t <= room`: the part of the segment on the rect's side of it.
  const sides: [step: number, room: number][] = [
    [-dx, from.x - rect.x],
    [dx, rect.x + rect.width - from.x],
    [-dy, from.y - rect.y],
    [dy, rect.y + rect.height - from.y],
  ];
  let enter = 0;
  let leave = 1;
  for (const [step, room] of sides) {
    if (step === 0) {
      if (room < 0) return false;
      continue;
    }
    const t = room / step;
    if (step < 0) enter = Math.max(enter, t);
    else leave = Math.min(leave, t);
    if (enter > leave) return false;
  }
  return true;
}

/** Distance from the segment to the rect: 0 when it passes through it. */
export function segmentRectDistance(from: Point, to: Point, rect: Rect): number {
  if (segmentCrossesRect(from, to, rect)) return 0;
  // Two convex shapes apart are nearest at an end of one or a corner of the other.
  return Math.min(
    pointRectDistance(from, rect),
    pointRectDistance(to, rect),
    ...rectCornerPoints(rect).map((corner) => segDist(corner, from, to)),
  );
}

/**
 * Does the polygon (even-odd, as {@link pointInPoly} reads it) touch the rect:
 * overlap it, hold it, or meet its edge?
 */
export function polygonTouchesRect(ring: readonly Point[], rect: Rect): boolean {
  if (ring.some((vertex) => rectContains(rect, vertex))) return true;
  if (pointInPoly({ x: rect.x, y: rect.y }, ring)) return true;
  return ring.some((vertex, i) => segmentCrossesRect(vertex, ring[(i + 1) % ring.length]!, rect));
}

/** Even-odd point-in-polygon. */
export function pointInPoly(point: Point, points: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const vertex = points[i];
    const previousVertex = points[j];
    if (
      vertex.y > point.y !== previousVertex.y > point.y &&
      point.x <
        ((previousVertex.x - vertex.x) * (point.y - vertex.y)) / (previousVertex.y - vertex.y) +
          vertex.x
    )
      inside = !inside;
  }
  return inside;
}

export function unionRect(points: Point[]): Rect {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const point of points) {
    x0 = Math.min(x0, point.x);
    y0 = Math.min(y0, point.y);
    x1 = Math.max(x1, point.x);
    y1 = Math.max(y1, point.y);
  }
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

export const expandRect = (rect: Rect, pad: number): Rect => ({
  x: rect.x - pad,
  y: rect.y - pad,
  width: rect.width + 2 * pad,
  height: rect.height + 2 * pad,
});

export const rectCornerPoints = (rect: Rect): Point[] => [
  { x: rect.x, y: rect.y },
  { x: rect.x + rect.width, y: rect.y },
  { x: rect.x + rect.width, y: rect.y + rect.height },
  { x: rect.x, y: rect.y + rect.height },
];

export const DEG2RAD = Math.PI / 180;

/** Normalize degrees into `[0, 360)`. */
export const normalizeDeg = (degrees: number): number => ((degrees % 360) + 360) % 360;

export const rectCenter = (rect: Rect): Point => ({
  x: rect.x + rect.width / 2,
  y: rect.y + rect.height / 2,
});

/** `rect` with width↔height swapped about its own centre — the unrotated box
 *  whose quarter-turn AABB is exactly `rect` again. */
export function transposedAboutCenter(rect: Rect): Rect {
  const point = rectCenter(rect);
  return {
    x: point.x - rect.height / 2,
    y: point.y - rect.width / 2,
    width: rect.height,
    height: rect.width,
  };
}

const rotateAboutM = (pivot: Point, deg: number): Mat2D<'page', 'page'> =>
  rotateAbout(pivot as PointIn<'page'>, deg * DEG2RAD);

/** Rotate one point about a pivot by `deg` (CW, page space). */
export const rotatePoint = (point: Point, pivot: Point, deg: number): Point =>
  applyPoint(rotateAboutM(pivot, deg), point as PointIn<'page'>);

/** The AABB of `rect` rotated `deg` about `pivot` (its own centre unless given). */
export function rotatedAabb(rect: Rect, deg: number, pivot: Point = rectCenter(rect)): Rect {
  if (!deg) return rect;
  return unionRect(rectCornerPoints(rect).map((corner) => rotatePoint(corner, pivot, deg)));
}

/** Shrink a rect inward by `pad` on every side, staying centred and never
 *  collapsing past zero (a thick stroke on a tiny shape just yields a 0-extent
 *  path rather than an inverted one). The inverse of `expandRect` for shapes. */
export const insetRect = (rect: Rect, pad: number): Rect => {
  const width = Math.max(0, rect.width - 2 * pad);
  const height = Math.max(0, rect.height - 2 * pad);
  return {
    x: rect.x + (rect.width - width) / 2,
    y: rect.y + (rect.height - height) / 2,
    width,
    height,
  };
};

export const OPPOSITE_HANDLE: Record<RectHandle, RectHandle> = {
  nw: 'se',
  ne: 'sw',
  se: 'nw',
  sw: 'ne',
  n: 's',
  s: 'n',
  e: 'w',
  w: 'e',
};

/**
 * Resize a rotated box by `handle`, keeping the opposite corner/edge fixed in
 * world space. The pointer is mapped into the box's local (unrotated) frame, the
 * axis-aligned `resizeRect` runs there, then the new box is repositioned so the
 * anchor (the opposite handle's point) lands back where it was — and the box
 * still rotates about its own centre. With `rot === 0` this is exactly the plain
 * `resizeRect`.
 */
export function resizeRotatedRect(base: Rect, rot: number, handle: RectHandle, to: Point): Rect {
  if (!rot) return resizeRect(base, handle, to);
  const c0 = rectCenter(base);
  const localTo = rotatePoint(to, c0, -rot);
  const next = resizeRect(base, handle, localTo);
  const anchorLocal = rectHandlePoint(base, OPPOSITE_HANDLE[handle]);
  const anchorWorld = rotatePoint(anchorLocal, c0, rot);
  const nextCenterLocal = rectCenter(next);
  // offset of the anchor from the new centre, in the local frame; rotate it to
  // world orientation and place the new centre so the anchor stays put.
  const offX = anchorLocal.x - nextCenterLocal.x;
  const offY = anchorLocal.y - nextCenterLocal.y;
  const rad = rot * DEG2RAD;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const rOffX = cos * offX - sin * offY;
  const rOffY = sin * offX + cos * offY;
  const cx = anchorWorld.x - rOffX;
  const cy = anchorWorld.y - rOffY;
  return {
    x: cx - next.width / 2,
    y: cy - next.height / 2,
    width: next.width,
    height: next.height,
  };
}
