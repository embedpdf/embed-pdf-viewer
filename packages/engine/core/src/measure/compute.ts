import type { PdfMeasure } from '../dto/Measure';
import type { PdfPoint } from '../geometry/primitives';

export interface MeasuredScale {
  sx: number;
  sy: number;
}
const positive = (n: number): boolean => Number.isFinite(n) && n > 0;
export function scaleOf(measure: PdfMeasure): MeasuredScale | null {
  const sx = Math.fround(measure.x[0]?.conversion ?? NaN);
  if (!positive(sx)) return null;
  if (!measure.y) return { sx, sy: sx };
  const cy = Math.fround(measure.y[0]?.conversion ?? NaN);
  const cyx = Math.fround(measure.cyx ?? NaN);
  const sy = cy * cyx;
  return positive(cy) && positive(cyx) && positive(sy) ? { sx, sy } : null;
}

export const measurementPoint = (p: PdfPoint): PdfPoint => ({
  x: Math.fround(p.x),
  y: Math.fround(p.y),
});

export function pathLength(
  points: readonly PdfPoint[],
  closed: boolean,
  scale: MeasuredScale,
): number {
  let total = 0;
  const normalized = points.map(measurementPoint);
  for (let i = 0; i < (closed ? normalized.length : normalized.length - 1); i++) {
    const a = normalized[i],
      b = normalized[(i + 1) % normalized.length];
    total += Math.hypot((b.x - a.x) * scale.sx, (b.y - a.y) * scale.sy);
  }
  return total;
}

export function polygonArea(points: readonly PdfPoint[], scale: MeasuredScale): number {
  if (points.length < 3) return 0;
  const normalized = points.map(measurementPoint);
  const origin = normalized[0];
  let twice = 0;
  // Relative coordinates avoid cancellation at a large nonzero page origin.
  for (let i = 1; i < normalized.length - 1; i++) {
    const a = normalized[i],
      b = normalized[i + 1];
    twice += (a.x - origin.x) * (b.y - origin.y) - (b.x - origin.x) * (a.y - origin.y);
  }
  return Math.abs(twice * scale.sx * scale.sy) / 2;
}

/** A measured area must have one simple, nonzero boundary. Repeated closing
 *  vertices are allowed in imported PDFs; crossings and overlapping edges are not. */
export function validAreaBoundary(points: readonly PdfPoint[]): boolean {
  const boundary = points.map(measurementPoint);
  const same = (a: PdfPoint, b: PdfPoint) => a.x === b.x && a.y === b.y;
  if (boundary.length > 1 && same(boundary[0], boundary[boundary.length - 1])) {
    boundary.pop();
  }
  if (boundary.length < 3 || polygonArea(boundary, { sx: 1, sy: 1 }) === 0) return false;

  const cross = (a: PdfPoint, b: PdfPoint, c: PdfPoint) =>
    (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const onSegment = (a: PdfPoint, b: PdfPoint, p: PdfPoint) =>
    cross(a, b, p) === 0 &&
    p.x >= Math.min(a.x, b.x) &&
    p.x <= Math.max(a.x, b.x) &&
    p.y >= Math.min(a.y, b.y) &&
    p.y <= Math.max(a.y, b.y);

  for (let i = 0; i < boundary.length; i++) {
    const a = boundary[i];
    const b = boundary[(i + 1) % boundary.length];
    if (same(a, b)) return false;
    const next = boundary[(i + 2) % boundary.length];
    // Adjacent collinear edges may continue forward, but must not double back.
    const doublesBack = (b.x - a.x) * (next.x - b.x) + (b.y - a.y) * (next.y - b.y) < 0;
    if (cross(a, b, next) === 0 && doublesBack) {
      return false;
    }

    for (let j = i + 1; j < boundary.length; j++) {
      if (j === i + 1 || (i === 0 && j === boundary.length - 1)) continue;
      const c = boundary[j];
      const d = boundary[(j + 1) % boundary.length];
      if (onSegment(a, b, c) || onSegment(a, b, d) || onSegment(c, d, a) || onSegment(c, d, b)) {
        return false;
      }
      if (
        Math.sign(cross(a, b, c)) !== Math.sign(cross(a, b, d)) &&
        Math.sign(cross(c, d, a)) !== Math.sign(cross(c, d, b))
      ) {
        return false;
      }
    }
  }
  return true;
}
