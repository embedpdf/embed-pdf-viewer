/**
 * What an annotation paints, as a few simple pieces, and the two questions
 * asked of them: is a point near the ink (a click), and does a rectangle
 * touch it (the marquee). Each shape family says what it paints
 * (`ShapeFamily.painted`); a click and a marquee read the same pieces,
 * so they can't disagree: a rectangle of no size touches exactly what a
 * click with no margin hits there.
 */
import {
  pointInPoly,
  polygonTouchesRect,
  rectCornerPoints,
  rotatePoint,
  segDist,
  segmentRectDistance,
} from './rect';
import type { Point, Rect } from './types';

/** One piece of what an annotation paints, in page space. */
export type PaintedPiece =
  /** Ink along a path, `halfWidth` either side of it; `closed` runs it back to the first point. */
  | {
      readonly kind: 'stroke';
      readonly points: readonly Point[];
      readonly closed: boolean;
      readonly halfWidth: number;
    }
  /** A filled polygon (even-odd). A margin doesn't grow it: ink around it does. */
  | { readonly kind: 'area'; readonly ring: readonly Point[] }
  /**
   * An ellipse turned `rotation` degrees clockwise about `center`: its ink,
   * `halfWidth` either side of it, and its inside when `filled`. The ink's
   * width is measured in radii along the smaller radius, so a long ellipse's
   * ink is a little wider at its ends.
   */
  | {
      readonly kind: 'oval';
      readonly center: Point;
      readonly rx: number;
      readonly ry: number;
      readonly rotation: number;
      readonly halfWidth: number;
      readonly filled: boolean;
    };

/**
 * A solid body: anything inside the ring, and anything within a margin of
 * its edge (a rim of ink with no width). A text box, a caret and a
 * measurement's caption are hit this way.
 */
export const bodyPieces = (ring: readonly Point[]): PaintedPiece[] => [
  { kind: 'area', ring },
  { kind: 'stroke', points: ring, closed: true, halfWidth: 0 },
];

/** Is `point` within `margin` of what the pieces paint? */
export const paintedNear = (
  pieces: readonly PaintedPiece[],
  point: Point,
  margin: number,
): boolean => pieces.some((piece) => pieceNear(piece, point, margin));

/** Does the rect touch what the pieces paint: cross its ink, or lie on its fill? */
export const paintedTouches = (pieces: readonly PaintedPiece[], rect: Rect): boolean =>
  pieces.some((piece) => pieceTouches(piece, rect));

function pieceNear(piece: PaintedPiece, point: Point, margin: number): boolean {
  switch (piece.kind) {
    case 'stroke':
      return someSegment(piece, (from, to) => segDist(point, from, to) <= piece.halfWidth + margin);
    case 'area':
      return pointInPoly(point, piece.ring);
    case 'oval': {
      if (piece.rx <= 0 || piece.ry <= 0) return false;
      const local = toOvalFrame(piece, point);
      const reach = Math.hypot(local.x, local.y);
      const band = inRadii(piece, piece.halfWidth + margin);
      return piece.filled ? reach <= 1 + band : Math.abs(reach - 1) <= band;
    }
  }
}

function pieceTouches(piece: PaintedPiece, rect: Rect): boolean {
  switch (piece.kind) {
    case 'stroke':
      return someSegment(
        piece,
        (from, to) => segmentRectDistance(from, to, rect) <= piece.halfWidth,
      );
    case 'area':
      return polygonTouchesRect(piece.ring, rect);
    case 'oval': {
      if (piece.rx <= 0 || piece.ry <= 0) return false;
      // In the oval's own frame, scaled to radii, the rect is a parallelogram
      // and the ellipse a unit circle: the rect touches the ink when it
      // reaches into the ink's ring, and the fill when it reaches its disc.
      const corners = rectCornerPoints(rect).map((corner) => toOvalFrame(piece, corner));
      const center = { x: 0, y: 0 };
      const nearest = pointInPoly(center, corners)
        ? 0
        : Math.min(...corners.map((corner, i) => segDist(center, corner, corners[(i + 1) % 4]!)));
      const farthest = Math.max(...corners.map((corner) => Math.hypot(corner.x, corner.y)));
      const band = inRadii(piece, piece.halfWidth);
      return nearest <= 1 + band && (piece.filled || farthest >= 1 - band);
    }
  }
}

type Oval = Extract<PaintedPiece, { kind: 'oval' }>;

/** `point` in the oval's own frame, scaled so the ellipse is the unit circle (1 from the middle on it). */
function toOvalFrame(oval: Oval, point: Point): Point {
  const local = oval.rotation ? rotatePoint(point, oval.center, -oval.rotation) : point;
  return { x: (local.x - oval.center.x) / oval.rx, y: (local.y - oval.center.y) / oval.ry };
}

/** A distance in page units as radii, measured along the smaller radius. */
const inRadii = (oval: Oval, distance: number): number => distance / Math.min(oval.rx, oval.ry);

/** Does `test` hold for any segment of the stroke (its closing one too)? */
function someSegment(
  stroke: Extract<PaintedPiece, { kind: 'stroke' }>,
  test: (from: Point, to: Point) => boolean,
): boolean {
  const { points } = stroke;
  for (let i = 0; i < points.length - 1; i++) if (test(points[i]!, points[i + 1]!)) return true;
  return stroke.closed && points.length > 2 && test(points[points.length - 1]!, points[0]!);
}
