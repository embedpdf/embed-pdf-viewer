/**
 * Cubic Béziers, as the cloudy borders and ink draw them: the point at a
 * parameter, where a curve turns, points along it, and a number for SVG path
 * data.
 */
import type { Point } from './types';

/** The point at `t` on the cubic Bézier `p0..p3`. */
export function bezierAt(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const rest = 1 - t;
  const weights = [rest * rest * rest, 3 * rest * rest * t, 3 * rest * t * t, t * t * t];
  return {
    x: weights[0]! * p0.x + weights[1]! * p1.x + weights[2]! * p2.x + weights[3]! * p3.x,
    y: weights[0]! * p0.y + weights[1]! * p1.y + weights[2]! * p2.y + weights[3]! * p3.y,
  };
}

/** Where a cubic Bézier coordinate `p0..p3` turns: the parameters in (0, 1) where its slope is zero. */
export function bezierTurns(p0: number, p1: number, p2: number, p3: number): number[] {
  const a = -p0 + 3 * p1 - 3 * p2 + p3;
  const b = 2 * (p0 - 2 * p1 + p2);
  const c = p1 - p0;
  const roots =
    Math.abs(a) < 1e-12
      ? Math.abs(b) < 1e-12
        ? []
        : [-c / b]
      : b * b - 4 * a * c < 0
        ? []
        : [
            (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a),
            (-b - Math.sqrt(b * b - 4 * a * c)) / (2 * a),
          ];
  return roots.filter((t) => t > 0 && t < 1);
}

/**
 * Points along the cubic Bézier `p0..p3` after `p0`, evenly spaced in `t`,
 * whose chords stay within `tolerance` of the curve: split into n chords, a
 * cubic strays at most 3/4 of its larger control-point second difference
 * over n² from them.
 */
export function flattenBezier(
  p0: Point,
  p1: Point,
  p2: Point,
  p3: Point,
  tolerance: number,
): Point[] {
  const bend = Math.max(
    Math.hypot(p0.x - 2 * p1.x + p2.x, p0.y - 2 * p1.y + p2.y),
    Math.hypot(p1.x - 2 * p2.x + p3.x, p1.y - 2 * p2.y + p3.y),
  );
  const steps = Math.max(1, Math.ceil(Math.sqrt((0.75 * bend) / tolerance)));
  const points: Point[] = [];
  for (let i = 1; i <= steps; i++) points.push(bezierAt(p0, p1, p2, p3, i / steps));
  return points;
}

/** A number in SVG path data: at most four decimals. */
export const pathNumber = (value: number): string => Number(value.toFixed(4)).toString();
