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
import type { AnnotationDTO } from '@embedpdf/engine-core/runtime';

import { cloudyBorderExtent, cloudyPath } from '../cloudy';
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
  rotatedHandleCursor,
  segDist,
  type RectHandle,
} from '../rect';
import type { Border, Handle, Point, Rect, RenderNode } from '../types';
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

type TurningAnnotation = Extract<AnnotationDTO, { subtype: 'square' | 'circle' | 'stamp' }>;

/** A box kind's shape, read off its annotation. */
function readBox(annotation: AnnotationDTO): BoxShape {
  if (!TURNING_KINDS.has(annotation.subtype)) {
    return { kind: 'box', box: annotation.rect, rotation: 0, ellipse: false };
  }
  const { box, rotation } = annotation as TurningAnnotation;
  return { kind: 'box', box, rotation: rotation ?? 0, ellipse: annotation.subtype === 'circle' };
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

/** How far a cloudy border's bumps reach out from the box; 0 without a cloud. */
function cloudReach(shape: BoxShape, strokeWidth: number, border: Border | undefined): number {
  return border?.kind === 'cloudy'
    ? cloudyBorderExtent(border.intensity, strokeWidth, shape.ellipse)
    : 0;
}

/**
 * What the shape draws, before its turn: the box, grown by a cloud's reach.
 * A plain stroke draws inside the box.
 */
function boxDrawnBounds(shape: BoxShape, strokeWidth: number, border?: Border): Rect {
  return expandRect(shape.box, cloudReach(shape, strokeWidth, border));
}

/** The box's corners as the page shows them (nw, ne, se, sw), turned about its middle. */
export function boxCorners(shape: TurnedBox): [Point, Point, Point, Point] {
  const middle = rectCenter(shape.box);
  return rectCornerPoints(shape.box).map((corner) =>
    rotatePoint(corner, middle, shape.rotation),
  ) as [Point, Point, Point, Point];
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
 * Is `point` on the shape: within `margin` of its stroke, or inside it when
 * `filled`. The test runs in the box's own frame (the point turned back).
 * A plain stroke draws inside the box, centred half its width in; a cloud's
 * bumps fill the band between the box and its reach.
 */
function boxHit(
  shape: BoxShape,
  point: Point,
  margin: number,
  filled: boolean,
  strokeWidth: number,
  border?: Border,
): boolean {
  const local = shape.rotation ? rotatePoint(point, rectCenter(shape.box), -shape.rotation) : point;
  const reach = cloudReach(shape, strokeWidth, border);
  // The band the ink covers: a stroke's width inside the box, or a cloud's reach outside it.
  const band = reach
    ? { path: expandRect(shape.box, reach / 2), halfWidth: reach / 2 }
    : { path: insetRect(shape.box, strokeWidth / 2), halfWidth: strokeWidth / 2 };
  const tolerance = margin + band.halfWidth;
  const outer = expandRect(shape.box, reach);
  if (shape.ellipse) {
    const middle = rectCenter(shape.box);
    const outerRx = outer.width / 2;
    const outerRy = outer.height / 2;
    if (outerRx <= 0 || outerRy <= 0) return false;
    if (filled && Math.hypot((local.x - middle.x) / outerRx, (local.y - middle.y) / outerRy) <= 1)
      return true;
    const rx = Math.max(0.01, band.path.width / 2);
    const ry = Math.max(0.01, band.path.height / 2);
    const distance = Math.hypot((local.x - middle.x) / rx, (local.y - middle.y) / ry);
    return Math.abs(distance - 1) <= tolerance / Math.min(rx, ry);
  }
  if (filled && rectContains(outer, local)) return true;
  const [nw, ne, se, sw] = rectCornerPoints(band.path);
  return (
    segDist(local, nw, ne) <= tolerance ||
    segDist(local, ne, se) <= tolerance ||
    segDist(local, se, sw) <= tolerance ||
    segDist(local, sw, nw) <= tolerance
  );
}

/**
 * What the shape draws, before its turn (the renderer turns it about the
 * box's middle): a cloud around the box, or the box's outline, inset half
 * the stroke so the ink lies inside the box.
 */
function boxScene(shape: BoxShape, strokeWidth = 0, border?: Border): RenderNode[] {
  if (border?.kind === 'cloudy' && shape.box.width > 0 && shape.box.height > 0) {
    return [
      {
        kind: 'path',
        d: cloudyPath(shape.box, shape.ellipse, border.intensity, strokeWidth),
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
  bounds: (shape) => shape.box,
  drawnBounds: boxDrawnBounds,
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
  hit: boxHit,
  scene: boxScene,
};
