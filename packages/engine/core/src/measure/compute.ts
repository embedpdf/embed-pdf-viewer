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
