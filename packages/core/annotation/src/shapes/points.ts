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
 */
import {
  pagePointTurned,
  pagePointUnturned,
  pageTurnOfDrawn,
  pageTurnOfUpright,
  type AnnotationDTO,
  type LineEndings,
  type PagePointTurn,
} from '@embedpdf/engine-core/runtime';

import { cloudyBorderExtent, cloudyPolyPath } from '../cloudy';
import { endingNodes, endingNodesHit } from '../endings';
import {
  expandRect,
  normalizeDeg,
  pointInPoly,
  rectCenter,
  rectCornerPoints,
  rotatePoint,
  segDist,
  unionRect,
} from '../rect';
import type { Border, Handle, LineEnding, Point, Rect, RenderNode } from '../types';

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
  /** Degrees clockwise about the middle of the box around the upright points; 0 when upright. */
  rotation: number;
}

/** Ink: its strokes upright. */
export interface InkShape {
  kind: 'ink';
  inkList: Point[][];
  /** Degrees clockwise about the middle of the box around the upright points; 0 when upright. */
  rotation: number;
}

/** A points family record's shape. */
export type PointsShape = LineShape | PolyShape | InkShape;

type PointsAnnotation = Extract<
  AnnotationDTO,
  { subtype: 'line' | 'polyline' | 'polygon' | 'ink' }
>;

/** A points kind's shape, read off its annotation. */
export function readPoints(annotation: PointsAnnotation): PointsShape {
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
        rotation,
      };
    case 'polygon':
      return { kind: 'poly', vertices: annotation.vertices, closed: true, rotation };
    case 'ink':
      return { kind: 'ink', inkList: annotation.inkList, rotation };
  }
}

/**
 * The engine fields that state `shape`'s points and turn (`null` when
 * upright, so a turn is cleared rather than kept). The endings are a field
 * of their own, written when they change.
 */
export function writePoints(shape: PointsShape) {
  const rotation = shape.rotation || null;
  if (shape.kind === 'line') return { linePoints: shape.linePoints, rotation };
  if (shape.kind === 'poly') return { vertices: shape.vertices, rotation };
  return { inkList: shape.inkList, rotation };
}

/** The shape's upright points, one list per stroke: a line's two ends, a poly's vertices, each ink stroke. */
export function uprightStrokesOf(shape: PointsShape): Point[][] {
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

/** The turn that draws the upright points, or `undefined` upright. */
const turnOf = (shape: PointsShape): PagePointTurn | undefined =>
  shape.rotation ? pageTurnOfUpright(uprightStrokesOf(shape).flat(), shape.rotation) : undefined;

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
export const pointsMiddleOf = (shape: PointsShape): Point =>
  rectCenter(unionRect(uprightStrokesOf(shape).flat()));

/** The box around the drawn points. */
export const pointsBounds = (shape: PointsShape): Rect => unionRect(drawnStrokesOf(shape).flat());

/** The shape moved by `delta`. */
export function pointsTranslate<S extends PointsShape>(shape: S, delta: Point): S {
  if (!delta.x && !delta.y) return shape;
  const move = (point: Point): Point => ({ x: point.x + delta.x, y: point.y + delta.y });
  return withUprightStrokes(
    shape,
    uprightStrokesOf(shape).map((stroke) => stroke.map(move)),
  );
}

/** Moves smaller than this are float noise from a turn about the shape's own middle. */
const NOISE = 1e-9;

/**
 * The shape turned `degrees` clockwise about `pivot`: its middle orbits the
 * pivot (the upright points move with it), and its turn grows. About its own
 * middle, only the turn changes.
 */
export function pointsRotateAbout<S extends PointsShape>(
  shape: S,
  pivot: Point,
  degrees: number,
): S {
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
export function pointsScaleAbout<S extends PointsShape>(
  shape: S,
  anchor: Point,
  sx: number,
  sy: number,
): S {
  const about = shape.rotation ? pointsMiddleOf(shape) : anchor;
  const middle = shape.rotation
    ? { x: anchor.x + (about.x - anchor.x) * sx, y: anchor.y + (about.y - anchor.y) * sy }
    : anchor;
  const scale = (point: Point): Point => ({
    x: middle.x + (point.x - about.x) * sx,
    y: middle.y + (point.y - about.y) * sy,
  });
  return withUprightStrokes(
    shape,
    uprightStrokesOf(shape).map((stroke) => stroke.map(scale)),
  );
}

/** The shape straightened: turned back about `pivot` (its own middle by default). */
export function pointsUpright<S extends PointsShape>(shape: S, pivot?: Point): S {
  if (!shape.rotation) return shape;
  return pointsRotateAbout(shape, pivot ?? pointsMiddleOf(shape), -shape.rotation);
}

/** The vertex handles, where the points are drawn; ink has none. */
export function pointsHandles(shape: PointsShape): Handle[] {
  if (shape.kind === 'ink') return [];
  return drawnStrokesOf(shape)[0]!.map((at, i) => ({ id: `v${i}`, at, cursor: 'crosshair' }));
}

/** The shape with vertex `handle` (`v<i>`) dragged to the drawn point `to`; the upright points follow. */
export function pointsDrag<S extends PointsShape>(shape: S, handle: string, to: Point): S {
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
 * Miter kinds only (line / polyline / polygon). Ink is round-capped/round-joined,
 * never spikes, and is bounded elsewhere by a plain half-width grow.
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

type EndingSeg = { tip: Point; angle: number; ending: LineEnding | undefined };

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
 * What the shape draws, as the engine's `rect` takes it in. Ink is round-capped
 * and round-joined, so its strokes grow by half the width. A line or poly wraps
 * its actual stroke outline (per join, and each ending's own outline), so a
 * mitred arrowhead tip is enclosed exactly. A closed poly's cloud reaches past
 * its vertices by the cloud's extent.
 */
export function pointsDrawnBounds(shape: PointsShape, strokeWidth: number, border?: Border): Rect {
  const strokes = drawnStrokesOf(shape);
  if (shape.kind === 'ink') return expandRect(unionRect(strokes.flat()), strokeWidth / 2);
  const points = strokes[0]!;
  const closed = shape.kind === 'poly' && shape.closed;
  if (closed && border?.kind === 'cloudy') {
    // Corner curls are arcs of the cloud radius centred at the vertices, and the
    // stroke straddles them — so ink reaches radius + strokeWidth/2 beyond the
    // vertex hull on every side: exactly `cloudyBorderExtent`.
    return expandRect(unionRect(points), cloudyBorderExtent(border.intensity, strokeWidth, false));
  }
  const outline = strokeOutlinePoints(points, closed, strokeWidth);
  for (const seg of endingSegs(shape)) {
    for (const node of endingNodes(seg.tip, seg.angle, seg.ending, strokeWidth)) {
      if (node.kind === 'poly') {
        // arrowheads / diamonds / squares are stroked polys: their sharp corners
        // miter exactly like the body, so wrap the real outline (tip included).
        outline.push(...strokeOutlinePoints(node.points, node.closed, strokeWidth));
      } else if (node.kind === 'ellipse') {
        // a stroked ellipse (circle ending) grows uniformly by h — no miters.
        outline.push(...rectCornerPoints(expandRect(node.rect, strokeWidth / 2)));
      }
    }
  }
  return unionRect(outline);
}

/**
 * The oriented box around what the shape draws: the drawn bounds of its
 * upright points, turned about its middle — the snug tilted rectangle.
 */
export function pointsCorners(
  shape: PointsShape,
  strokeWidth: number,
  border?: Border,
): [Point, Point, Point, Point] {
  const upright = { ...shape, rotation: 0 };
  const corners = rectCornerPoints(pointsDrawnBounds(upright, strokeWidth, border));
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
 * Is `point` on the shape: within `margin` of a stroke or an ending, or
 * inside a filled polygon. The stroke band widens with the stroke width.
 */
export function pointsHit(
  shape: PointsShape,
  point: Point,
  margin: number,
  filled: boolean,
  strokeWidth: number,
): boolean {
  const tolerance = margin + strokeWidth / 2;
  const strokes = drawnStrokesOf(shape);
  const closed = shape.kind === 'poly' && shape.closed;
  if (filled && closed && pointInPoly(point, strokes[0]!)) return true;
  for (const stroke of strokes) {
    for (let i = 0; i < stroke.length - 1; i++)
      if (segDist(point, stroke[i]!, stroke[i + 1]!) <= tolerance) return true;
    if (
      closed &&
      stroke.length > 2 &&
      segDist(point, stroke[stroke.length - 1]!, stroke[0]!) <= tolerance
    )
      return true;
  }
  return endingSegs(shape).some((seg) =>
    endingNodesHit(endingNodes(seg.tip, seg.angle, seg.ending, strokeWidth), point, tolerance),
  );
}

/**
 * What the shape draws, where it is drawn: a line, a poly (a closed one's
 * cloud as PDFium bakes it: curls on the vertex path, reaching out), each
 * ink stroke as an open polyline, and the endings.
 */
export function pointsScene(shape: PointsShape, strokeWidth = 0, border?: Border): RenderNode[] {
  const strokes = drawnStrokesOf(shape);
  if (shape.kind === 'ink')
    return strokes.map((stroke) => ({ kind: 'poly', points: stroke, closed: false }));
  const points = strokes[0]!;
  if (shape.kind === 'poly' && shape.closed && border?.kind === 'cloudy' && points.length >= 3)
    return [{ kind: 'path', d: cloudyPolyPath(points, border.intensity, strokeWidth) }];
  const nodes: RenderNode[] =
    shape.kind === 'line'
      ? [{ kind: 'line', a: points[0]!, b: points[1]! }]
      : [{ kind: 'poly', points, closed: shape.closed }];
  for (const seg of endingSegs(shape))
    nodes.push(...endingNodes(seg.tip, seg.angle, seg.ending, strokeWidth));
  return nodes;
}
