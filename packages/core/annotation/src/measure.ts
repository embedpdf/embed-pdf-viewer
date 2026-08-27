/**
 * The GEOMETRY half of measurement: which formula a shape's read-out uses,
 * where the label sits, and the hatch that fills an area. The unit/scale/format
 * half lives in `@embedpdf/engine-core`'s `measurement.ts`; this module is the
 * bridge that lets `scene()` paint a read-out from the same `Geom` it already
 * draws.
 *
 * Content space and PDF user space differ by a y-flip and a translation (see
 * `pdfToContentPoint`) — a RIGID transform at scale 1. Lengths and areas are
 * therefore identical in both, so measuring the content-space geometry the
 * renderer holds needs no round-trip through the engine's PDF rect.
 */
import {
  formatMeasurement,
  type MeasurementInfo,
  type MeasurementMode,
} from '@embedpdf/engine-core/runtime';

import { centroidOf } from './geometry';
import type { Geom, Rect, Vec } from './types';

/** Euclidean distance between two content-space points. */
export function pointDistance(a: Vec, b: Vec): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Total length of the OPEN path through `pts`. */
export function polylineLength(pts: Vec[]): number {
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += pointDistance(pts[i - 1], pts[i]);
  return total;
}

/** Perimeter of the CLOSED polygon through `pts` (the open path plus the
 *  closing edge back to the first point). */
export function polygonPerimeter(pts: Vec[]): number {
  if (pts.length < 2) return 0;
  return polylineLength(pts) + pointDistance(pts[pts.length - 1], pts[0]);
}

/** Polygon area via the shoelace formula. Unsigned, so winding never matters
 *  (a y-flip between PDF and content space reverses it). */
export function polygonArea(pts: Vec[]): number {
  if (pts.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

/** Area of a rectangle. Rotation preserves area, so the unrotated box the
 *  geometry carries is the right one to measure. */
export function rectArea(r: Rect): number {
  return Math.abs(r.width * r.height);
}

/** Area of the ellipse inscribed in `r`. */
export function ellipseArea(r: Rect): number {
  return (Math.PI * Math.abs(r.width) * Math.abs(r.height)) / 4;
}

/** The four corners of `r`, clockwise from top-left. */
function rectRing(r: Rect): Vec[] {
  return [
    { x: r.x, y: r.y },
    { x: r.x + r.width, y: r.y },
    { x: r.x + r.width, y: r.y + r.height },
    { x: r.x, y: r.y + r.height },
  ];
}

/** A polygon approximation of the ellipse inscribed in `r`, fine enough that
 *  the hatch clip reads as a smooth curve at any practical zoom. */
function ellipseRing(r: Rect, segments = 64): Vec[] {
  const cx = r.x + r.width / 2;
  const cy = r.y + r.height / 2;
  const rx = r.width / 2;
  const ry = r.height / 2;
  const out: Vec[] = [];
  for (let i = 0; i < segments; i++) {
    const t = (i / segments) * Math.PI * 2;
    out.push({ x: cx + rx * Math.cos(t), y: cy + ry * Math.sin(t) });
  }
  return out;
}

/**
 * The closed outline of an area geometry, as a point ring — the shape the hatch
 * is clipped against. `null` for geometry that encloses nothing.
 */
function areaRing(geom: Geom): Vec[] | null {
  if (geom.t === 'rect') return geom.ellipse ? ellipseRing(geom.rect) : rectRing(geom.rect);
  // Only a CLOSED poly encloses a region. An open path measured in area mode
  // still gets a number (the shoelace formula implies the closing edge), but
  // hatching it would draw a fill for a boundary the user never drew.
  if (geom.t === 'poly') return geom.closed && geom.points.length >= 3 ? geom.points : null;
  return null;
}

/**
 * The RAW page-point measurement for a geometry under `mode` — a length for
 * `distance`/`perimeter`, an area for `area`. Returns 0 for a shape that cannot
 * express the requested mode (an open line has no area), so a mismatched pair
 * formats as a harmless zero instead of throwing.
 */
export function measureRawValue(geom: Geom, mode: MeasurementMode): number {
  if (geom.t === 'line') {
    return mode === 'area' ? 0 : pointDistance(geom.a, geom.b);
  }
  if (geom.t === 'poly') {
    if (mode === 'area') return polygonArea(geom.points);
    // A closed poly (polygon) measures its full perimeter including the closing
    // edge; an open one (polyline) measures the path actually drawn.
    return geom.closed ? polygonPerimeter(geom.points) : polylineLength(geom.points);
  }
  if (geom.t === 'rect') {
    if (mode === 'area') return geom.ellipse ? ellipseArea(geom.rect) : rectArea(geom.rect);
    // Perimeter of a box; an ellipse uses Ramanujan's approximation.
    if (geom.ellipse) {
      const a = geom.rect.width / 2;
      const b = geom.rect.height / 2;
      const h = ((a - b) * (a - b)) / ((a + b) * (a + b) || 1);
      return Math.PI * (a + b) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)));
    }
    return 2 * (Math.abs(geom.rect.width) + Math.abs(geom.rect.height));
  }
  return 0;
}

/** The formatted read-out for a geometry under `info`. */
export function measureText(geom: Geom, info: MeasurementInfo): string {
  return formatMeasurement(measureRawValue(geom, info.mode), info);
}

/**
 * Where the read-out sits, in content units.
 *
 * A LINE labels its midpoint, nudged along the segment normal so the pill does
 * not sit on top of the stroke it is describing. Everything else labels its
 * centroid — inside the region being measured, which is what an area or a
 * closed perimeter reads as.
 */
export function measureLabelAnchor(geom: Geom, offset: number): Vec {
  if (geom.t === 'line') {
    const mid = { x: (geom.a.x + geom.b.x) / 2, y: (geom.a.y + geom.b.y) / 2 };
    const dx = geom.b.x - geom.a.x;
    const dy = geom.b.y - geom.a.y;
    const len = Math.hypot(dx, dy);
    if (!len) return mid;
    // Left-hand normal, so the label lands consistently on one side.
    return { x: mid.x - (dy / len) * offset, y: mid.y + (dx / len) * offset };
  }
  if (geom.t === 'poly' && !geom.closed) {
    // An open path's centroid can fall well off the path (a deep V); label the
    // midpoint of its longest segment instead, which is always ON the drawing.
    const pts = geom.points;
    let best = 0;
    let bestLen = -1;
    for (let i = 1; i < pts.length; i++) {
      const l = pointDistance(pts[i - 1], pts[i]);
      if (l > bestLen) {
        bestLen = l;
        best = i;
      }
    }
    if (bestLen <= 0) return pts[0] ?? { x: 0, y: 0 };
    const a = pts[best - 1];
    const b = pts[best];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }
  return centroidOf(geom);
}

/**
 * A 45° hatch fill clipped to an area geometry, as SVG path data in content
 * units. `spacing` is the perpendicular gap between lines — the caller divides
 * by zoom to hold the hatch density constant on screen.
 *
 * The hatch is generated as a family of parallel lines and clipped by scanning
 * each line's intersections with the outline ring: sort the crossings along the
 * line and keep alternate spans (the even-odd rule). That handles concave
 * polygons and the ellipse approximation with the same few lines of math, and
 * needs no clip-path support in the renderer.
 */
export function hatchPath(geom: Geom, spacing: number): string {
  const ring = areaRing(geom);
  if (!ring || !(spacing > 0)) return '';

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of ring) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  if (!(maxX > minX) || !(maxY > minY)) return '';

  // Lines run along (1,1)/√2; `c = x - y` indexes the family, stepping by
  // spacing·√2 in c for a perpendicular gap of `spacing`.
  const step = spacing * Math.SQRT2;
  const cMin = minX - maxY;
  const cMax = maxX - minY;
  // A pathological spacing (a huge zoom-out) must not spin forever.
  const MAX_LINES = 400;
  if ((cMax - cMin) / step > MAX_LINES) return '';

  const segs: string[] = [];
  for (let c = Math.ceil(cMin / step) * step; c <= cMax; c += step) {
    // Intersect y = x - c with each edge, collecting the crossing x values.
    const xs: number[] = [];
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      // Parameterize the edge and solve (a + t(b-a)).y = (a + t(b-a)).x - c.
      const da = a.x - a.y - c;
      const db = b.x - b.y - c;
      if (da === 0 && db === 0) continue; // edge lies ON the line — skip
      if (da === 0) {
        xs.push(a.x);
        continue;
      }
      if (da < 0 === db < 0) continue; // no crossing
      const t = da / (da - db);
      xs.push(a.x + t * (b.x - a.x));
    }
    if (xs.length < 2) continue;
    xs.sort((p, q) => p - q);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const x0 = xs[i];
      const x1 = xs[i + 1];
      if (x1 - x0 < 1e-6) continue;
      segs.push(`M${num(x0)} ${num(x0 - c)}L${num(x1)} ${num(x1 - c)}`);
    }
  }
  return segs.join('');
}

const num = (n: number): number => Number(n.toFixed(3));
