import type { InkStraightenOptions, Vec } from './types';

/**
 * Recognise a sufficiently straight freehand stroke and axis-snap it when it is
 * close to horizontal or vertical. Diagonal strokes remain untouched: this is
 * a highlighter aid, not a general line simplifier.
 */
export function straightenInkStroke(points: readonly Vec[], options: InkStraightenOptions): Vec[] {
  if (points.length < 3) return [...points];
  const first = points[0];
  const last = points[points.length - 1];
  const dx = last.x - first.x;
  const dy = last.y - first.y;
  const length = Math.hypot(dx, dy);
  if (length < 3) return [...points];

  const maxDeviation = points.reduce((max, point) => {
    const distance = Math.abs(dx * (first.y - point.y) - (first.x - point.x) * dy) / length;
    return Math.max(max, distance);
  }, 0);
  if (maxDeviation / length >= options.deviationThreshold) return [...points];

  const angle = Math.atan2(Math.abs(dy), Math.abs(dx)) * (180 / Math.PI);
  if (angle <= options.axisSnapDegrees) {
    const y = points.reduce((sum, point) => sum + point.y, 0) / points.length;
    return [
      { x: first.x, y },
      { x: last.x, y },
    ];
  }
  if (angle >= 90 - options.axisSnapDegrees) {
    const x = points.reduce((sum, point) => sum + point.x, 0) / points.length;
    return [
      { x, y: first.y },
      { x, y: last.y },
    ];
  }
  return [...points];
}
