/**
 * The box family: squares, circles and stamps, and the kinds whose shape is
 * their `rect` (note and attachment icons, links, widgets, an area
 * redaction). Its shape is the engine's own fields: the box before any turn
 * (`box`, or `rect` for a kind that never turns) and the turn about the box's
 * middle (`rotation`, degrees clockwise).
 *
 * A cloudy border reaches out from the box, as the engine draws it: the box
 * is where the bumps start, and the engine's `rect` takes them in. The
 * handles sit on the box.
 *
 * Moving, turning, scaling and resizing work on any turned box
 * ({@link TurnedBox}), so the text box family shares them.
 */
import type { Annotation } from '@embedpdf/engine-core/runtime';

import { cloudyBounds, cloudyOutline, cloudyPath } from '../cloudy';
import type { PaintedPiece } from '../painted';
import {
  MIN_SIZE,
  RECT_HANDLES,
  expandRect,
  insetRect,
  normalizeDeg,
  rectCenter,
  rectContains,
  rectCornerPoints,
  rectHandlePoint,
  resizeRotatedRect,
  rotatePoint,
  rotatedAabb,
  rotatedHandleCursor,
  transposedAboutCenter,
  type RectHandle,
} from '../rect';
import type { Handle, Placement, Point, Rect, RenderNode, Stroke } from '../types';
import type { ShapeFamily } from './family';

/** A box and its turn, as the engine keeps them. */
export interface TurnedBox {
  /** The box before any turn: the engine's `box`, or its `rect` for a kind that never turns. */
  box: Rect;
  /** Degrees clockwise about the middle of `box`; 0 when upright. */
  rotation: number;
}

/** A box family record's shape: the engine's box and its turn. */
export interface BoxShape extends TurnedBox {
  kind: 'box';
  /** Drawn as the ellipse in `box`: a circle. */
  ellipse: boolean;
}

/** The kinds that keep their box in `box` and turn it by `rotation`; the rest keep it in `rect`. */
const TURNING_KINDS: ReadonlySet<string> = new Set(['square', 'circle', 'stamp']);

type TurningAnnotation = Extract<Annotation, { subtype: 'square' | 'circle' | 'stamp' }>;

/** Whether a box kind draws the ellipse in its box: a circle, and a radio button (the engine draws one round). */
const drawsEllipse = (annotation: Annotation): boolean =>
  annotation.subtype === 'circle' ||
  (annotation.subtype === 'widget' && annotation.fieldFamily === 'radio');

/** A box kind's shape, read off its annotation. */
function readBox(annotation: Annotation): BoxShape {
  if (!TURNING_KINDS.has(annotation.subtype)) {
    return { kind: 'box', box: annotation.rect, rotation: 0, ellipse: drawsEllipse(annotation) };
  }
  const { box, rotation } = annotation as TurningAnnotation;
  return { kind: 'box', box, rotation: rotation ?? 0, ellipse: drawsEllipse(annotation) };
}

/**
 * A box kind's shape where a create gesture places a box. An upright tool's
 * turn (`placement.rot`, quarter turns) matters only to a drawing that reads
 * one way: a stamp's image keeps it. Every other box (a square, a circle, a
 * widget) takes the region the turned box covers, a quarter turn swapping
 * its sides, and stores no turn: it shows as the author saw it, unturned.
 */
function placeBox(placement: Placement, annotation: Annotation): BoxShape | null {
  if (placement.kind !== 'box') return null;
  const keepsTurn = annotation.subtype === 'stamp';
  const quarter = placement.rot % 180 !== 0;
  return {
    kind: 'box',
    box: !keepsTurn && quarter ? transposedAboutCenter(placement.rect) : placement.rect,
    rotation: keepsTurn ? placement.rot : 0,
    ellipse: drawsEllipse(annotation),
  };
}

/**
 * The engine fields that state `shape` for a kind: its `box` and `rotation`
 * (`null` when upright, so a turn is cleared rather than kept), or its `rect`.
 */
function writeBox(
  shape: BoxShape,
  subtype: string,
): { box: Rect; rotation: number | null } | { rect: Rect } {
  return TURNING_KINDS.has(subtype)
    ? { box: shape.box, rotation: shape.rotation || null }
    : { rect: shape.box };
}

/**
 * What the shape draws, before its turn: the box (a plain stroke draws inside
 * it), or the box around what its cloud paints.
 */
function boxDrawnBounds(shape: BoxShape, stroke: Stroke): Rect {
  const { cloudyIntensity, strokeWidth } = stroke;
  return cloudyIntensity && shape.box.width > 0 && shape.box.height > 0
    ? cloudyBounds(shape.box, shape.ellipse, cloudyIntensity, strokeWidth)
    : shape.box;
}

/** The upright page box around what it paints: what it draws, turned about the box's middle. */
function boxRect(shape: BoxShape, stroke: Stroke): Rect {
  return rotatedAabb(boxDrawnBounds(shape, stroke), shape.rotation, rectCenter(shape.box));
}

/** The box's corners as the page shows them (nw, ne, se, sw), turned about its middle. */
export function boxCorners(shape: TurnedBox): [Point, Point, Point, Point] {
  const middle = rectCenter(shape.box);
  return rectCornerPoints(shape.box).map((corner) =>
    rotatePoint(corner, middle, shape.rotation),
  ) as [Point, Point, Point, Point];
}

/** Is `point` in the turned box, grown by `margin`? Tested in the box's own frame (the point turned back). */
export function isInTurnedBox(shape: TurnedBox, point: Point, margin: number): boolean {
  const local = shape.rotation ? rotatePoint(point, rectCenter(shape.box), -shape.rotation) : point;
  return rectContains(expandRect(shape.box, margin), local);
}

/** The shape moved by `delta`. */
export function boxTranslate<S extends TurnedBox>(shape: S, delta: Point): S {
  return { ...shape, box: { ...shape.box, x: shape.box.x + delta.x, y: shape.box.y + delta.y } };
}

/** The box of `size` centred on `middle`. */
const boxAround = (middle: Point, size: { width: number; height: number }): Rect => ({
  x: middle.x - size.width / 2,
  y: middle.y - size.height / 2,
  width: size.width,
  height: size.height,
});

/** The shape turned `degrees` clockwise about `pivot`: its middle orbits the pivot, and its turn grows. */
export function boxRotateAbout<S extends TurnedBox>(shape: S, pivot: Point, degrees: number): S {
  return {
    ...shape,
    box: boxAround(rotatePoint(rectCenter(shape.box), pivot, degrees), shape.box),
    rotation: normalizeDeg(shape.rotation + degrees),
  };
}

/**
 * The shape scaled about `anchor` by `(sx, sy)`: its middle moves with the
 * scale and its size scales, and its turn stays (a turned member of a
 * selection scales the same in both directions).
 */
export function boxScaleAbout<S extends TurnedBox>(
  shape: S,
  anchor: Point,
  sx: number,
  sy: number,
): S {
  const middle = rectCenter(shape.box);
  return {
    ...shape,
    box: boxAround(
      { x: anchor.x + (middle.x - anchor.x) * sx, y: anchor.y + (middle.y - anchor.y) * sy },
      {
        width: Math.max(MIN_SIZE, shape.box.width * Math.abs(sx)),
        height: Math.max(MIN_SIZE, shape.box.height * Math.abs(sy)),
      },
    ),
  };
}

/** The eight resize handles, on the box as the page shows it; each cursor turns with the box. */
export function boxHandles(shape: TurnedBox): Handle[] {
  const middle = rectCenter(shape.box);
  return RECT_HANDLES.map((handle) => ({
    id: handle,
    at: rotatePoint(rectHandlePoint(shape.box, handle), middle, shape.rotation),
    cursor: rotatedHandleCursor(handle, shape.rotation),
  }));
}

/** The shape resized by dragging `handle` to `to`: the opposite handle stays where it is. */
export function boxResize<S extends TurnedBox>(shape: S, handle: string, to: Point): S {
  return { ...shape, box: resizeRotatedRect(shape.box, shape.rotation, handle as RectHandle, to) };
}

/**
 * What the shape paints, turned with the box: a plain border's ink, which
 * lies inside the box, centred half the stroke in; or a cloud's ink along its
 * curves. Filled, it paints the box too, and a cloud the ring its curves close.
 */
function boxPainted(shape: BoxShape, stroke: Stroke, filled: boolean): PaintedPiece[] {
  const { strokeWidth, cloudyIntensity } = stroke;
  const { box, rotation, ellipse } = shape;
  const halfWidth = strokeWidth / 2;
  const middle = rectCenter(box);
  const turned = (points: Point[]): Point[] =>
    rotation ? points.map((point) => rotatePoint(point, middle, rotation)) : points;
  if (cloudyIntensity && box.width > 0 && box.height > 0) {
    const curves = cloudyOutline(box, ellipse, cloudyIntensity, strokeWidth).map(turned);
    const ink = curves.map(
      (points): PaintedPiece => ({ kind: 'stroke', points, closed: true, halfWidth }),
    );
    if (!filled) return ink;
    const inside: PaintedPiece = ellipse
      ? {
          kind: 'oval',
          center: middle,
          rx: box.width / 2,
          ry: box.height / 2,
          rotation,
          halfWidth: 0,
          filled: true,
        }
      : { kind: 'area', ring: boxCorners(shape) };
    return [inside, ...curves.map((ring): PaintedPiece => ({ kind: 'area', ring })), ...ink];
  }
  const inset = insetRect(box, halfWidth);
  if (ellipse) {
    if (box.width <= 0 || box.height <= 0) return [];
    // The ink's middle is the inset ellipse; its radii never quite reach 0.
    const rx = Math.max(0.01, inset.width / 2);
    const ry = Math.max(0.01, inset.height / 2);
    return [{ kind: 'oval', center: middle, rx, ry, rotation, halfWidth, filled }];
  }
  const ink: PaintedPiece = {
    kind: 'stroke',
    points: turned(rectCornerPoints(inset)),
    closed: true,
    halfWidth,
  };
  return filled ? [{ kind: 'area', ring: boxCorners(shape) }, ink] : [ink];
}

/**
 * What the shape draws, before its turn (the renderer turns it about the
 * box's middle): a cloud around the box, or the box's outline, inset half
 * the stroke so the ink lies inside the box.
 */
function boxScene(shape: BoxShape, stroke: Stroke): RenderNode[] {
  const { strokeWidth, cloudyIntensity } = stroke;
  if (cloudyIntensity && shape.box.width > 0 && shape.box.height > 0) {
    return [
      {
        kind: 'path',
        d: cloudyPath(shape.box, shape.ellipse, cloudyIntensity, strokeWidth),
      },
    ];
  }
  const rect = insetRect(shape.box, strokeWidth / 2);
  return [shape.ellipse ? { kind: 'ellipse', rect } : { kind: 'rect', rect }];
}

/** The box family: a box and its turn, drawn as a rectangle, an ellipse or a cloud. */
export const boxFamily: ShapeFamily<BoxShape> = {
  read: readBox,
  write: writeBox,
  placed: placeBox,
  bounds: (shape) => shape.box,
  drawnBounds: boxDrawnBounds,
  rect: boxRect,
  selectionBounds: (shape) => shape.box,
  oriented: () => true,
  turnedCorners: boxCorners,
  pivot: (shape) => rectCenter(shape.box),
  translate: boxTranslate,
  rotateAbout: boxRotateAbout,
  scaleAbout: boxScaleAbout,
  upright: (shape) => ({ ...shape, rotation: 0 }),
  handles: boxHandles,
  drag: boxResize,
  painted: boxPainted,
  scene: boxScene,
};
