/**
 * How Acrobat draws an ink stroke (`/InkList`) when it writes the appearance,
 * and so how the runtime draws it (`cpdf_ink_curves.h` in the fork): cubic
 * Béziers fitted to the points as Schneider fits digitized curves ("An
 * Algorithm for Automatically Fitting Digitized Curves", Graphics Gems,
 * 1990), without his Newton step. Checked against the appearances Acrobat
 * wrote, to 0.001 pt, segment for segment:
 *
 * - Repeated points in a row count once.
 * - A piece of the stroke is one cubic. At the stroke's ends it leaves and
 *   arrives along the first and last segment; where two pieces meet, along
 *   the line from the point before to the point after (no direction when
 *   those are the same point: the stroke turns straight back).
 * - A piece of two points gets handles a third of its length.
 * - A longer piece gets the least-squares cubic over its points, placed by
 *   chord length. It stays one piece when every point is within the
 *   tolerance of the curve, at its place, and the curve is within the
 *   tolerance of the lines between the points. Otherwise it splits at its
 *   worst point and both halves are fitted again.
 * - A stroke of one point is a dot: a circle of radius 0.5, filled and
 *   stroked.
 *
 * The fit is the same in page space: it measures only distances and
 * directions, which a flip and a shift keep.
 */
import { bezierAt, flattenBezier, pathNumber } from './bezier';
import type { Point } from './types';

/**
 * How far the curves may stray, in points. Acrobat's lies above 1.2747 and at
 * most 1.5062 (the dense zigzag in the tests tells), at any width.
 */
export const INK_CURVE_TOLERANCE = Math.SQRT2;

/** The radius of the dot a stroke of one point draws. */
export const INK_DOT_RADIUS = 0.5;

/** One cubic of a stroke, from the end of the one before (or the stroke's start). */
export interface InkCubic {
  control1: Point;
  control2: Point;
  end: Point;
}

/** One stroke as it is drawn: cubics from its first point, or a dot. */
export type InkStrokeCurves =
  | { kind: 'curves'; start: Point; cubics: InkCubic[] }
  | { kind: 'dot'; center: Point };

/**
 * A piece of the stroke to fit: its first and last point, and the directions
 * the curve leaves the first along and arrives at the last against (pointing
 * back into the curve), both unit or none.
 */
interface Piece {
  first: number;
  last: number;
  leaving: Point;
  arriving: Point;
}

const plus = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y });
const minus = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });
const times = (a: Point, s: number): Point => ({ x: a.x * s, y: a.y * s });
const dot = (a: Point, b: Point): number => a.x * b.x + a.y * b.y;
const distance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);

/** `v` at length 1; no direction (0, 0) when it has no length. */
function unit(v: Point): Point {
  const length = Math.hypot(v.x, v.y);
  return length === 0 ? { x: 0, y: 0 } : { x: v.x / length, y: v.y / length };
}

/** Where each point of the piece sits along it, 0 to 1, by the length of the lines between them. */
function chordLengthPlaces(points: Point[], piece: Piece): number[] {
  const places = [0];
  for (let i = piece.first + 1; i <= piece.last; i++)
    places.push(places[places.length - 1]! + distance(points[i]!, points[i - 1]!));
  const length = places[places.length - 1]!;
  return places.map((place) => place / length);
}

/**
 * The cubic from the piece's first point to its last, along its two
 * directions, whose handle lengths put it closest to the points at their
 * places (least squares). Handles that come out shorter than a millionth of
 * the piece's span, or backwards, are a third of the span instead.
 */
function leastSquaresCubic(points: Point[], piece: Piece, places: number[]): Point[] {
  const start = points[piece.first]!;
  const end = points[piece.last]!;
  let c00 = 0;
  let c01 = 0;
  let c11 = 0;
  let x0 = 0;
  let x1 = 0;
  places.forEach((u, i) => {
    const rest = 1 - u;
    const b0 = rest * rest * rest;
    const b1 = 3 * u * rest * rest;
    const b2 = 3 * u * u * rest;
    const b3 = u * u * u;
    const a0 = times(piece.leaving, b1);
    const a1 = times(piece.arriving, b2);
    c00 += dot(a0, a0);
    c01 += dot(a0, a1);
    c11 += dot(a1, a1);
    const off = minus(
      points[piece.first + i]!,
      plus(plus(times(start, b0), times(start, b1)), plus(times(end, b2), times(end, b3))),
    );
    x0 += dot(a0, off);
    x1 += dot(a1, off);
  });
  const det = c00 * c11 - c01 * c01;
  let leavingLength = det === 0 ? 0 : (x0 * c11 - x1 * c01) / det;
  let arrivingLength = det === 0 ? 0 : (c00 * x1 - c01 * x0) / det;
  const span = distance(end, start);
  if (leavingLength < 1e-6 * span || arrivingLength < 1e-6 * span) {
    leavingLength = span / 3;
    arrivingLength = span / 3;
  }
  return [
    start,
    plus(start, times(piece.leaving, leavingLength)),
    plus(end, times(piece.arriving, arrivingLength)),
    end,
  ];
}

/** The piece's point farthest from the curve at its place: the square of that distance, and which (the last of equals). */
function worstPoint(
  points: Point[],
  piece: Piece,
  places: number[],
  cubic: Point[],
): { squared: number; index: number } {
  const [p0, p1, p2, p3] = cubic as [Point, Point, Point, Point];
  let worst = { squared: 0, index: Math.floor((piece.last - piece.first + 1) / 2) + piece.first };
  for (let i = piece.first + 1; i < piece.last; i++) {
    const off = minus(bezierAt(p0, p1, p2, p3, places[i - piece.first]!), points[i]!);
    const squared = dot(off, off);
    if (squared >= worst.squared) worst = { squared, index: i };
  }
  return worst;
}

function distanceToSegment(p: Point, a: Point, b: Point): number {
  const ab = minus(b, a);
  const lengthSquared = dot(ab, ab);
  const t =
    lengthSquared === 0 ? 0 : Math.min(1, Math.max(0, dot(minus(p, a), ab) / lengthSquared));
  return distance(p, plus(a, times(ab, t)));
}

/** How far the curve strays from the lines between the piece's points: the farthest of 65 places along it, each from its nearest line. */
function distanceFromLines(points: Point[], piece: Piece, cubic: Point[]): number {
  const [p0, p1, p2, p3] = cubic as [Point, Point, Point, Point];
  let farthest = 0;
  for (let k = 0; k <= 64; k++) {
    const at = bezierAt(p0, p1, p2, p3, k / 64);
    let nearest = Infinity;
    for (let i = piece.first; i < piece.last; i++)
      nearest = Math.min(nearest, distanceToSegment(at, points[i]!, points[i + 1]!));
    farthest = Math.max(farthest, nearest);
  }
  return farthest;
}

/**
 * The stroke as Acrobat draws it: the cubics that fit its points, or a dot
 * for one point; `null` for a stroke with no points.
 */
export function fitInkStroke(
  stroke: readonly Point[],
  tolerance: number = INK_CURVE_TOLERANCE,
): InkStrokeCurves | null {
  const points: Point[] = [];
  for (const point of stroke) {
    const previous = points[points.length - 1];
    if (!previous || previous.x !== point.x || previous.y !== point.y) points.push(point);
  }
  if (points.length === 0) return null;
  if (points.length === 1) return { kind: 'dot', center: points[0]! };

  // The pieces still to fit, the next on top: a split piece's first half is
  // fitted (and split) before its second, so the cubics come out in order.
  const cubics: InkCubic[] = [];
  const last = points.length - 1;
  const pending: Piece[] = [
    {
      first: 0,
      last,
      leaving: unit(minus(points[1]!, points[0]!)),
      arriving: unit(minus(points[last - 1]!, points[last]!)),
    },
  ];
  while (pending.length > 0) {
    const piece = pending.pop()!;
    const start = points[piece.first]!;
    const end = points[piece.last]!;
    if (piece.last - piece.first === 1) {
      const handle = distance(end, start) / 3;
      cubics.push({
        control1: plus(start, times(piece.leaving, handle)),
        control2: plus(end, times(piece.arriving, handle)),
        end,
      });
      continue;
    }
    const places = chordLengthPlaces(points, piece);
    const cubic = leastSquaresCubic(points, piece, places);
    const worst = worstPoint(points, piece, places, cubic);
    if (
      worst.squared < tolerance * tolerance &&
      distanceFromLines(points, piece, cubic) < tolerance
    ) {
      cubics.push({ control1: cubic[1]!, control2: cubic[2]!, end });
      continue;
    }
    // The halves meet at the worst point, along the line from the point
    // before it to the point after.
    const split = worst.index;
    const back = unit(minus(points[split - 1]!, points[split + 1]!));
    pending.push({
      first: split,
      last: piece.last,
      leaving: times(back, -1),
      arriving: piece.arriving,
    });
    pending.push({ first: piece.first, last: split, leaving: piece.leaving, arriving: back });
  }
  return { kind: 'curves', start: points[0]!, cubics };
}

/** The stroke's curves as SVG path data. */
export function inkCurvesPath(curves: Extract<InkStrokeCurves, { kind: 'curves' }>): string {
  const at = (point: Point) => `${pathNumber(point.x)} ${pathNumber(point.y)}`;
  return [
    `M ${at(curves.start)}`,
    ...curves.cubics.map(
      ({ control1, control2, end }) => `C ${at(control1)} ${at(control2)} ${at(end)}`,
    ),
  ].join(' ');
}

/** How far the points along the curves (`inkCurvesPolyline`) may stray from them. */
const POLYLINE_TOLERANCE = 0.05;

/** Points along the stroke's curves, close enough to stand in for them in a hit test. */
export function inkCurvesPolyline(curves: Extract<InkStrokeCurves, { kind: 'curves' }>): Point[] {
  const points = [curves.start];
  let from = curves.start;
  for (const { control1, control2, end } of curves.cubics) {
    points.push(...flattenBezier(from, control1, control2, end, POLYLINE_TOLERANCE));
    from = end;
  }
  return points;
}
