/**
 * The points family: lines, polylines, polygons and ink. Its shape is the
 * engine's own fields: the points upright (`linePoints`, `vertices`,
 * `inkList`), the line endings, and the turn that draws them (`rotation`,
 * degrees clockwise about the middle of the box around the upright points,
 * as a square turns about its box). Where the points are drawn is worked out
 * from these ({@link drawnStrokesOf}) for hit-testing, drawing and handles.
 *
 * So every kind that turns works the same way: turning one changes its
 * `rotation` (and where its middle is, when it turns about another pivot),
 * and straightening one clears it. A dragged vertex lands where it was
 * dropped: the drawn points change and the upright ones follow, turned back
 * as the engine turns them.
 *
 * A polygon or polyline measurement's caption center is kept as the engine
 * keeps it, upright with the vertices: a move or a scale carries it along, a
 * turn turns it with the drawing, and a dragged vertex leaves it where it is.
 */
import {
  pagePointTurned,
  pagePointUnturned,
  pageTurnOfDrawn,
  pageTurnOfUpright,
  type Annotation,
  type LineEndings,
  type PagePointTurn,
} from '@embedpdf/engine-core/runtime';

import { bezierAt, bezierTurns } from '../bezier';
import { cloudyPolyBounds, cloudyPolyOutline, cloudyPolyPath } from '../cloudy';
import { endingNodes, endingPieces } from '../endings';
import {
  fitInkStroke,
  INK_DOT_RADIUS,
  inkCurvesPath,
  inkCurvesPolyline,
  type InkStrokeCurves,
} from '../ink-curves';
import type { PaintedPiece } from '../painted';
import {
  expandRect,
  normalizeDeg,
  rectCenter,
  rectCornerPoints,
  rotatePoint,
  unionRect,
} from '../rect';
import type { Handle, LineEnding, Placement, Point, Rect, RenderNode, Stroke } from '../types';
import type { ShapeFamily } from './family';

/** A line: its two ends upright, and their endings. */
export interface LineShape {
  kind: 'line';
  linePoints: { start: Point; end: Point };
  lineEndings?: LineEndings;
  /** Degrees clockwise about the middle of the box around the upright points; 0 when upright. */
  rotation: number;
}

/** A polygon (`closed`) or polyline: its vertices upright, and a polyline's endings. */
export interface PolyShape {
  kind: 'poly';
  vertices: Point[];
  closed: boolean;
  lineEndings?: LineEndings;
  /** A measurement's caption center, upright with the vertices; `null` places it automatically. */
  captionCenter?: Point | null;
  /** Degrees clockwise about the middle of the box around the upright points; 0 when upright. */
  rotation: number;
}

/** Ink: its strokes upright. */
export interface InkShape {
  kind: 'ink';
  inkList: Point[][];
  /** Degrees clockwise about the middle of the box around the upright points; 0 when upright. */
  rotation: number;
  /** The last stroke is still being drawn (an ink draft with the pen down): it draws as its points. */
  drawing?: boolean;
}

/** A points family record's shape. */
export type PointsShape = LineShape | PolyShape | InkShape;

type PointsAnnotation = Extract<Annotation, { subtype: 'line' | 'polyline' | 'polygon' | 'ink' }>;

/** A points kind's shape, read off its annotation. */
function readPoints(read: Annotation): PointsShape {
  const annotation = read as PointsAnnotation;
  const rotation = annotation.rotation ?? 0;
  switch (annotation.subtype) {
    case 'line':
      return {
        kind: 'line',
        linePoints: annotation.linePoints,
        ...(annotation.lineEndings ? { lineEndings: annotation.lineEndings } : {}),
        rotation,
      };
    case 'polyline':
      return {
        kind: 'poly',
        vertices: annotation.vertices,
        closed: false,
        ...(annotation.lineEndings ? { lineEndings: annotation.lineEndings } : {}),
        ...(annotation.captionCenter !== undefined
          ? { captionCenter: annotation.captionCenter }
          : {}),
        rotation,
      };
    case 'polygon':
      return {
        kind: 'poly',
        vertices: annotation.vertices,
        closed: true,
        ...(annotation.captionCenter !== undefined
          ? { captionCenter: annotation.captionCenter }
          : {}),
        rotation,
      };
    case 'ink':
      return { kind: 'ink', inkList: annotation.inkList, rotation };
  }
}

const NO_ENDINGS: LineEndings = { start: 'none', end: 'none' };

/** A line's or polyline's endings; none for an annotation that has none. */
export const lineEndingsOf = (annotation: Annotation): LineEndings =>
  ('lineEndings' in annotation && annotation.lineEndings) || NO_ENDINGS;

/** A line where a create gesture places a segment, with the tool's endings; no other points kind is placed. */
function placePoints(placement: Placement, annotation: Annotation): LineShape | null {
  if (placement.kind !== 'segment' || annotation.subtype !== 'line') return null;
  return {
    kind: 'line',
    linePoints: { start: placement.a, end: placement.b },
    lineEndings: lineEndingsOf(annotation),
    rotation: 0,
  };
}

/**
 * The engine fields that state `shape`'s points and turn (`null` when
 * upright, so a turn is cleared rather than kept). The endings are a field
 * of their own, written when they change.
 */
function writePoints(shape: PointsShape) {
  const rotation = shape.rotation || null;
  if (shape.kind === 'line') return { linePoints: shape.linePoints, rotation };
  if (shape.kind === 'poly')
    return {
      vertices: shape.vertices,
      ...(shape.captionCenter !== undefined ? { captionCenter: shape.captionCenter } : {}),
      rotation,
    };
  return { inkList: shape.inkList, rotation };
}

/** The shape's upright points, one list per stroke: a line's two ends, a poly's vertices, each ink stroke. */
function uprightStrokesOf(shape: PointsShape): Point[][] {
  if (shape.kind === 'line') return [[shape.linePoints.start, shape.linePoints.end]];
  if (shape.kind === 'poly') return [shape.vertices];
  return shape.inkList;
}

/** The shape with `strokes` as its upright points. */
function withUprightStrokes<S extends PointsShape>(shape: S, strokes: Point[][]): S {
  if (shape.kind === 'line') {
    const [start, end] = strokes[0]!;
    return { ...shape, linePoints: { start: start!, end: end! } };
  }
  if (shape.kind === 'poly') return { ...shape, vertices: strokes[0]! };
  return { ...shape, inkList: strokes };
}

/** The shape with every upright point, a caption center included, moved by `map`. */
function mapUpright<S extends PointsShape>(shape: S, map: (point: Point) => Point): S {
  const moved = withUprightStrokes(
    shape,
    uprightStrokesOf(shape).map((stroke) => stroke.map(map)),
  );
  return moved.kind === 'poly' && moved.captionCenter
    ? { ...moved, captionCenter: map(moved.captionCenter) }
    : moved;
}

/** The turn that draws the upright points, or `undefined` upright. */
const turnOf = (shape: PointsShape): PagePointTurn | undefined =>
  shape.rotation ? pageTurnOfUpright(uprightStrokesOf(shape).flat(), shape.rotation) : undefined;

/** Where an upright `point` of the shape (a caption center) is drawn. */
export function drawnPointOf(shape: PointsShape, point: Point): Point {
  const turn = turnOf(shape);
  return turn ? pagePointTurned(point, turn) : point;
}

/** The upright point of the shape that is drawn at `point`. */
export function uprightPointOf(shape: PointsShape, point: Point): Point {
  const turn = turnOf(shape);
  return turn ? pagePointUnturned(point, turn) : point;
}

const drawn = new WeakMap<PointsShape, Point[][]>();

/** Where the points are drawn: the upright ones turned by `rotation`. The same lists for the same shape. */
export function drawnStrokesOf(shape: PointsShape): Point[][] {
  const cached = drawn.get(shape);
  if (cached) return cached;
  const turn = turnOf(shape);
  const strokes = uprightStrokesOf(shape);
  const out = turn
    ? strokes.map((stroke) => stroke.map((point) => pagePointTurned(point, turn)))
    : strokes;
  drawn.set(shape, out);
  return out;
}

/** A line's two ends where they are drawn. */
export function drawnLineOf(shape: LineShape): { start: Point; end: Point } {
  const [start, end] = drawnStrokesOf(shape)[0]!;
  return { start: start!, end: end! };
}

/** A poly's vertices where they are drawn. */
export const drawnVerticesOf = (shape: PolyShape): Point[] => drawnStrokesOf(shape)[0]!;

/**
 * Where the shape turns: the middle of the box around its upright points. The
 * turn leaves it where it is, so it is also the drawing's middle; a caption or
 * an arrowhead never moves it.
 */
const pointsMiddleOf = (shape: PointsShape): Point =>
  rectCenter(unionRect(uprightStrokesOf(shape).flat()));

/** The box around the drawn points. */
const pointsBounds = (shape: PointsShape): Rect => unionRect(drawnStrokesOf(shape).flat());

/** The shape moved by `delta`. */
function pointsTranslate<S extends PointsShape>(shape: S, delta: Point): S {
  if (!delta.x && !delta.y) return shape;
  return mapUpright(shape, (point) => ({ x: point.x + delta.x, y: point.y + delta.y }));
}

/** Moves smaller than this are float noise from a turn about the shape's own middle. */
const NOISE = 1e-9;

/**
 * The shape turned `degrees` clockwise about `pivot`: its middle orbits the
 * pivot (the upright points move with it), and its turn grows. About its own
 * middle, only the turn changes.
 */
function pointsRotateAbout<S extends PointsShape>(shape: S, pivot: Point, degrees: number): S {
  const middle = pointsMiddleOf(shape);
  const moved = rotatePoint(middle, pivot, degrees);
  const delta = { x: moved.x - middle.x, y: moved.y - middle.y };
  const shifted =
    Math.abs(delta.x) < NOISE && Math.abs(delta.y) < NOISE ? shape : pointsTranslate(shape, delta);
  return { ...shifted, rotation: normalizeDeg(shape.rotation + degrees) };
}

/**
 * The shape scaled about `anchor` by `(sx, sy)`. Upright, the points scale
 * directly. Turned (a multi-selection scales a turned member the same in both
 * directions), the upright points scale about their middle, which moves with
 * the scale, and the turn stays.
 */
function pointsScaleAbout<S extends PointsShape>(
  shape: S,
  anchor: Point,
  sx: number,
  sy: number,
): S {
  const about = shape.rotation ? pointsMiddleOf(shape) : anchor;
  const middle = shape.rotation
    ? { x: anchor.x + (about.x - anchor.x) * sx, y: anchor.y + (about.y - anchor.y) * sy }
    : anchor;
  return mapUpright(shape, (point) => ({
    x: middle.x + (point.x - about.x) * sx,
    y: middle.y + (point.y - about.y) * sy,
  }));
}

/** The shape straightened: turned back about `pivot` (its own middle by default). */
function pointsUpright<S extends PointsShape>(shape: S, pivot?: Point): S {
  if (!shape.rotation) return shape;
  return pointsRotateAbout(shape, pivot ?? pointsMiddleOf(shape), -shape.rotation);
}

/** The vertex handles, where the points are drawn; ink has none. */
function pointsHandles(shape: PointsShape): Handle[] {
  if (shape.kind === 'ink') return [];
  return drawnStrokesOf(shape)[0]!.map((at, i) => ({ id: `v${i}`, at, cursor: 'crosshair' }));
}

/** The shape with vertex `handle` (`v<i>`) dragged to the drawn point `to`; the upright points follow. */
function pointsDrag<S extends PointsShape>(shape: S, handle: string, to: Point): S {
  if (shape.kind === 'ink') return shape;
  const index = Number(handle.slice(1));
  const points = drawnStrokesOf(shape)[0]!;
  if (!Number.isInteger(index) || index < 0 || index >= points.length) return shape;
  const moved = points.slice();
  moved[index] = to;
  if (!shape.rotation) return withUprightStrokes(shape, [moved]);
  const turn = pageTurnOfDrawn(moved, shape.rotation);
  return withUprightStrokes(shape, [moved.map((point) => pagePointUnturned(point, turn))]);
}

/* ── drawing ─────────────────────────────────────────────────────────────── */

/** Miter limit shared by the bounds math and the SVG renderer (`stroke-miterlimit`),
 *  so the computed box and the drawn stroke always agree on where a sharp join
 *  bevels instead of spiking. 10 = the PDF default (also what the baked /AP uses). */
export const MITER_LIMIT = 10;

/**
 * The outline points of a mitred, butt-capped polyline (open or closed) stroked
 * at `strokeWidth`: each segment's two side offsets (the straight extents + both
 * bevel corners) plus each interior join's outer miter tip — added only while the
 * join is within `MITER_LIMIT` (past that the renderer bevels it, and the segment
 * offsets already bound it). `unionRect` of these is the tight, asymmetric visual
 * box: a pointy join grows the box only on the side it actually spikes.
 *
 * Miter kinds only (line / polyline / polygon). Ink draws curves, bounded by
 * {@link inkOutlinePoints}.
 */
function strokeOutlinePoints(points: Point[], closed: boolean, strokeWidth: number): Point[] {
  const halfWidth = strokeWidth / 2;
  const pointCount = points.length;
  if (pointCount === 0) return [];
  if (pointCount === 1 || halfWidth === 0) return [...points];

  const segCount = closed ? pointCount : pointCount - 1;
  const dir: Point[] = [];
  const nrm: Point[] = [];
  for (let i = 0; i < segCount; i++) {
    const start = points[i]!;
    const end = points[(i + 1) % pointCount]!;
    const len = Math.hypot(end.x - start.x, end.y - start.y) || 1;
    const ux = (end.x - start.x) / len;
    const uy = (end.y - start.y) / len;
    dir.push({ x: ux, y: uy });
    nrm.push({ x: -uy, y: ux }); // a unit normal (either side; sign is re-picked below)
  }

  const out: Point[] = [];
  // Segment side offsets at both ends — covers the straight extents, the butt
  // caps at open ends, and the bevel corners of any beveled join.
  for (let i = 0; i < segCount; i++) {
    const start = points[i]!;
    const end = points[(i + 1) % pointCount]!;
    const nx = nrm[i]!.x * halfWidth;
    const ny = nrm[i]!.y * halfWidth;
    out.push({ x: start.x + nx, y: start.y + ny }, { x: start.x - nx, y: start.y - ny });
    out.push({ x: end.x + nx, y: end.y + ny }, { x: end.x - nx, y: end.y - ny });
  }

  // Interior joins: the outer miter tip, gated by the miter limit.
  const joinStart = closed ? 0 : 1;
  const joinEnd = closed ? pointCount : pointCount - 1; // vertices [joinStart, joinEnd)
  for (let vertexIndex = joinStart; vertexIndex < joinEnd; vertexIndex++) {
    const inIdx = closed ? (vertexIndex - 1 + pointCount) % pointCount : vertexIndex - 1;
    const outIdx = vertexIndex; // the segment starting at vertexIndex, open or closed
    const incoming = dir[inIdx]!; // previous -> vertexIndex
    const outgoing = dir[outIdx]!; // vertexIndex -> next
    const n1 = nrm[inIdx]!;
    const n2 = nrm[outIdx]!;
    // Outer bisector direction: opposite the interior bisector `outgoing - incoming`.
    const bx = incoming.x - outgoing.x;
    const by = incoming.y - outgoing.y;
    if (Math.hypot(bx, by) < 1e-9) continue; // straight run: no spike beyond the offsets
    let mhx = n1.x + n2.x;
    let mhy = n1.y + n2.y;
    const ml = Math.hypot(mhx, mhy);
    if (ml < 1e-9) continue; // exact hairpin: renderer bevels
    mhx /= ml;
    mhy /= ml;
    if (mhx * bx + mhy * by < 0) {
      mhx = -mhx; // point the miter unit vector to the outer side
      mhy = -mhy;
    }
    const cosHalf = Math.abs(mhx * n1.x + mhy * n1.y); // cos(deviation/2)
    if (cosHalf < 1e-9) continue;
    const miterLen = halfWidth / cosHalf;
    if (miterLen > MITER_LIMIT * halfWidth) continue; // too sharp: renderer bevels → offsets bound it
    const vertex = points[vertexIndex]!;
    out.push({ x: vertex.x + mhx * miterLen, y: vertex.y + mhy * miterLen });
  }
  return out;
}

/**
 * The outline points of `nodes` stroked at `strokeWidth`, as the renderer
 * draws them: a line or poly with butt caps and mitred joins
 * (`strokeOutlinePoints`), an ellipse or rect grown by half the stroke.
 * `unionRect` of them is the box they paint.
 */
export function strokedOutlineOf(nodes: readonly RenderNode[], strokeWidth: number): Point[] {
  return nodes.flatMap((node) => {
    switch (node.kind) {
      case 'line':
        return strokeOutlinePoints([node.a, node.b], false, strokeWidth);
      case 'poly':
        return strokeOutlinePoints(node.points, node.closed, strokeWidth);
      case 'ellipse':
      case 'rect':
        return rectCornerPoints(expandRect(node.rect, strokeWidth / 2));
      case 'path':
        return [];
    }
  });
}

const fitted = new WeakMap<Point[], InkStrokeCurves | null>();

/**
 * Each drawn ink stroke as Acrobat draws it (`ink-curves.ts`), fitted once
 * per stroke: a stroke the pen has left is fitted once while the next is drawn.
 */
function inkCurvesOf(strokes: Point[][]): InkStrokeCurves[] {
  return strokes.flatMap((stroke) => {
    let curves = fitted.get(stroke);
    if (curves === undefined) {
      curves = fitInkStroke(stroke);
      fitted.set(stroke, curves);
    }
    return curves ?? [];
  });
}

/**
 * An ink shape's strokes: the ones drawn as their curves, and the one the pen
 * is still drawing ({@link InkShape.drawing}), drawn as its points. Its curves
 * would move all along it as it grows: the fit splits a stroke where its worst
 * point lies, and each new point can move that. A stroke of one point is its
 * dot either way.
 */
function inkStrokesOf(
  shape: InkShape,
  strokes: Point[][],
): { fitted: Point[][]; drawing: Point[] | null } {
  const last = strokes[strokes.length - 1];
  if (!shape.drawing || !last || last.length < 2) return { fitted: strokes, drawing: null };
  return { fitted: strokes.slice(0, -1), drawing: last };
}

/** The unit direction from `from` to the first of `points` apart from it; none when all sit on it. */
function firstDirection(from: Point, points: Point[]): Point | null {
  for (const point of points) {
    const length = Math.hypot(point.x - from.x, point.y - from.y);
    if (length >= 1e-9) return { x: (point.x - from.x) / length, y: (point.y - from.y) / length };
  }
  return null;
}

/**
 * The points a fitted ink stroke's box is made of, as the runtime measures
 * what its appearance paints: the curves (their ends and where they turn)
 * and, with a width, the pen around them. That is half the width across each
 * curve's ends, round caps at the stroke's two ends, half the width past each
 * turn, and the miter where two curves meet in a corner, within
 * {@link MITER_LIMIT} (only where the stroke turns straight back: elsewhere
 * they meet smoothly). A dot reaches its radius and half the width.
 */
function inkOutlinePoints(curves: InkStrokeCurves, strokeWidth: number): Point[] {
  const half = strokeWidth / 2;
  if (curves.kind === 'dot') {
    const { x, y } = curves.center;
    const reach = INK_DOT_RADIUS + half;
    return [
      { x: x - reach, y: y - reach },
      { x: x + reach, y: y + reach },
    ];
  }
  const out: Point[] = [curves.start];
  const turns: Array<{ at: Point; acrossX: boolean }> = [];
  const pieces: Array<{ from: Point; to: Point; leaving: Point; arriving: Point }> = [];
  let from = curves.start;
  for (const { control1, control2, end } of curves.cubics) {
    out.push(end);
    for (const t of bezierTurns(from.x, control1.x, control2.x, end.x))
      turns.push({ at: bezierAt(from, control1, control2, end, t), acrossX: true });
    for (const t of bezierTurns(from.y, control1.y, control2.y, end.y))
      turns.push({ at: bezierAt(from, control1, control2, end, t), acrossX: false });
    const leaving = firstDirection(from, [control1, control2, end]);
    const back = firstDirection(end, [control2, control1, from]);
    if (leaving && back)
      pieces.push({ from, to: end, leaving, arriving: { x: -back.x, y: -back.y } });
    from = end;
  }
  out.push(...turns.map(({ at }) => at));
  if (half <= 0 || pieces.length === 0) return out;

  const across = (at: Point, direction: Point): Point[] => [
    { x: at.x - direction.y * half, y: at.y + direction.x * half },
    { x: at.x + direction.y * half, y: at.y - direction.x * half },
  ];
  const pen = (at: Point): Point[] => [
    { x: at.x - half, y: at.y },
    { x: at.x + half, y: at.y },
    { x: at.x, y: at.y - half },
    { x: at.x, y: at.y + half },
  ];
  for (const piece of pieces)
    out.push(...across(piece.from, piece.leaving), ...across(piece.to, piece.arriving));
  for (let k = 0; k + 1 < pieces.length; k++) {
    const { to: at, arriving } = pieces[k]!;
    const { leaving } = pieces[k + 1]!;
    const sum = Math.hypot(arriving.x + leaving.x, arriving.y + leaving.y);
    const outward = { x: arriving.x - leaving.x, y: arriving.y - leaving.y };
    const outwardLength = Math.hypot(outward.x, outward.y);
    // One over the sine of half the angle between them; past the limit the join is beveled.
    if (sum < 1e-9 || outwardLength < 1e-9 || 2 / sum > MITER_LIMIT) continue;
    const reach = (half * (2 / sum)) / outwardLength;
    out.push({ x: at.x + outward.x * reach, y: at.y + outward.y * reach });
  }
  out.push(...pen(pieces[0]!.from), ...pen(pieces[pieces.length - 1]!.to));
  for (const { at, acrossX } of turns)
    out.push(
      acrossX ? { x: at.x - half, y: at.y } : { x: at.x, y: at.y - half },
      acrossX ? { x: at.x + half, y: at.y } : { x: at.x, y: at.y + half },
    );
  return out;
}

type EndingSeg = { tip: Point; angle: number; ending: LineEnding | undefined };

/** The width a line's endings are sized by: a hairline (width 0) has a 1 pt line's, as the engine draws them. */
const endingWidth = (strokeWidth: number): number => (strokeWidth > 0 ? strokeWidth : 1);

/** The start/end tips of a line / open poly as drawn, each with the segment angle
 *  pointing out of the body into the tip (so an arrowhead opens back toward the line). */
function endingSegs(shape: PointsShape): EndingSeg[] {
  if (shape.kind === 'ink' || !shape.lineEndings) return [];
  if (shape.kind === 'poly' && shape.closed) return [];
  const points = drawnStrokesOf(shape)[0]!;
  const count = points.length;
  if (count < 2) return [];
  const first = points[0]!;
  const second = points[1]!;
  const last = points[count - 1]!;
  const beforeLast = points[count - 2]!;
  return [
    {
      tip: first,
      angle: Math.atan2(first.y - second.y, first.x - second.x),
      ending: shape.lineEndings.start,
    },
    {
      tip: last,
      angle: Math.atan2(last.y - beforeLast.y, last.x - beforeLast.x),
      ending: shape.lineEndings.end,
    },
  ];
}

/**
 * What the shape draws, as the engine's `rect` takes it in. Ink is its points
 * and the box around what its curves paint ({@link inkOutlinePoints}), as the
 * runtime frames it, and the pen around the stroke still being drawn. A line or poly wraps its actual stroke outline (per join,
 * and each ending's own outline), so a mitred arrowhead tip is enclosed
 * exactly. A closed poly's cloud reaches past its vertices by the cloud's
 * extent.
 */
function pointsDrawnBounds(shape: PointsShape, stroke: Stroke): Rect {
  const { strokeWidth, cloudyIntensity } = stroke;
  const strokes = drawnStrokesOf(shape);
  if (shape.kind === 'ink') {
    // The stroke being drawn has round caps and joins: the pen reaches half the width past its points.
    const { fitted, drawing } = inkStrokesOf(shape, strokes);
    return unionRect([
      ...strokes.flat(),
      ...inkCurvesOf(fitted).flatMap((curves) => inkOutlinePoints(curves, strokeWidth)),
      ...(drawing ? rectCornerPoints(expandRect(unionRect(drawing), strokeWidth / 2)) : []),
    ]);
  }
  const points = strokes[0]!;
  const closed = shape.kind === 'poly' && shape.closed;
  if (closed && cloudyIntensity) return cloudyPolyBounds(points, cloudyIntensity, strokeWidth);
  // Arrowheads, diamonds and squares are stroked polys whose sharp corners
  // miter like the body; a circle ending grows by half the stroke.
  const endings = endingSegs(shape).flatMap((seg) =>
    endingNodes(seg.tip, seg.angle, seg.ending, endingWidth(strokeWidth)),
  );
  return unionRect([
    ...strokeOutlinePoints(points, closed, strokeWidth),
    ...strokedOutlineOf(endings, strokeWidth),
  ]);
}

/**
 * The oriented box around what the shape draws: the drawn bounds of its
 * upright points, turned about its middle — the snug tilted rectangle.
 */
function pointsCorners(shape: PointsShape, stroke: Stroke): [Point, Point, Point, Point] {
  const upright = { ...shape, rotation: 0 };
  const corners = rectCornerPoints(pointsDrawnBounds(upright, stroke));
  if (!shape.rotation) return corners as [Point, Point, Point, Point];
  const middle = pointsMiddleOf(shape);
  return corners.map((corner) => rotatePoint(corner, middle, shape.rotation)) as [
    Point,
    Point,
    Point,
    Point,
  ];
}

/**
 * What the shape paints: each drawn stroke's ink, a filled polygon's inside,
 * and the endings. A cloudy polygon's ink runs along its cloud's curves, and
 * filled, it paints the polygon and the ring its curves close. Ink runs along
 * its fitted curves (the stroke still being drawn along its points), and a
 * stroke of one point is a filled dot.
 */
function pointsPainted(shape: PointsShape, stroke: Stroke, filled: boolean): PaintedPiece[] {
  const { strokeWidth, cloudyIntensity } = stroke;
  const halfWidth = strokeWidth / 2;
  const strokes = drawnStrokesOf(shape);
  if (shape.kind === 'ink') {
    const { fitted, drawing } = inkStrokesOf(shape, strokes);
    const pieces = inkCurvesOf(fitted).map(
      (curves): PaintedPiece =>
        curves.kind === 'dot'
          ? {
              kind: 'oval',
              center: curves.center,
              rx: INK_DOT_RADIUS,
              ry: INK_DOT_RADIUS,
              rotation: 0,
              halfWidth,
              filled: true,
            }
          : { kind: 'stroke', points: inkCurvesPolyline(curves), closed: false, halfWidth },
    );
    if (drawing) pieces.push({ kind: 'stroke', points: drawing, closed: false, halfWidth });
    return pieces;
  }
  const closed = shape.kind === 'poly' && shape.closed;
  const outline = strokes[0];
  const pieces: PaintedPiece[] = [];
  if (outline && closed && cloudyIntensity && outline.length >= 3) {
    const curves = cloudyPolyOutline(outline, cloudyIntensity, strokeWidth);
    if (filled) {
      pieces.push({ kind: 'area', ring: outline });
      for (const ring of curves) pieces.push({ kind: 'area', ring });
    }
    for (const points of curves) pieces.push({ kind: 'stroke', points, closed: true, halfWidth });
    return pieces;
  }
  if (outline && filled && closed) pieces.push({ kind: 'area', ring: outline });
  for (const points of strokes) pieces.push({ kind: 'stroke', points, closed, halfWidth });
  for (const seg of endingSegs(shape))
    pieces.push(
      ...endingPieces(
        endingNodes(seg.tip, seg.angle, seg.ending, endingWidth(strokeWidth)),
        strokeWidth,
      ),
    );
  return pieces;
}

/**
 * What the shape draws, where it is drawn: a line, a poly (a closed one's
 * cloud as PDFium bakes it: curls on the vertex path, reaching out), each
 * ink stroke as the curves Acrobat draws it with (a stroke of one point as a
 * dot, the stroke still being drawn as its points), and the endings.
 */
function pointsScene(shape: PointsShape, stroke: Stroke): RenderNode[] {
  const { strokeWidth, cloudyIntensity } = stroke;
  const strokes = drawnStrokesOf(shape);
  if (shape.kind === 'ink') {
    const { fitted, drawing } = inkStrokesOf(shape, strokes);
    const nodes = inkCurvesOf(fitted).map(
      (curves): RenderNode =>
        curves.kind === 'dot'
          ? {
              kind: 'ellipse',
              rect: {
                x: curves.center.x - INK_DOT_RADIUS,
                y: curves.center.y - INK_DOT_RADIUS,
                width: 2 * INK_DOT_RADIUS,
                height: 2 * INK_DOT_RADIUS,
              },
            }
          : { kind: 'path', d: inkCurvesPath(curves) },
    );
    if (drawing) nodes.push({ kind: 'poly', points: drawing, closed: false });
    return nodes;
  }
  const points = strokes[0]!;
  if (shape.kind === 'poly' && shape.closed && cloudyIntensity && points.length >= 3)
    return [{ kind: 'path', d: cloudyPolyPath(points, cloudyIntensity, strokeWidth) }];
  const nodes: RenderNode[] =
    shape.kind === 'line'
      ? [{ kind: 'line', a: points[0]!, b: points[1]! }]
      : [{ kind: 'poly', points, closed: shape.closed }];
  for (const seg of endingSegs(shape))
    nodes.push(...endingNodes(seg.tip, seg.angle, seg.ending, endingWidth(strokeWidth)));
  return nodes;
}

/** The points family: points kept upright and the turn that draws them. */
export const pointsFamily: ShapeFamily<PointsShape> = {
  read: readPoints,
  write: writePoints,
  placed: placePoints,
  bounds: pointsBounds,
  drawnBounds: pointsDrawnBounds,
  rect: pointsDrawnBounds,
  selectionBounds: pointsDrawnBounds,
  oriented: () => true,
  turnedCorners: pointsCorners,
  pivot: pointsMiddleOf,
  translate: pointsTranslate,
  rotateAbout: pointsRotateAbout,
  scaleAbout: pointsScaleAbout,
  upright: pointsUpright,
  handles: pointsHandles,
  drag: pointsDrag,
  painted: pointsPainted,
  scene: pointsScene,
};
