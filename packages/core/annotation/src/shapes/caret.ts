/**
 * The caret family: an insertion mark on its text. Its shape is the engine's
 * own fields: the box before any turn (`box`) and the turn about its middle
 * (`rotation`), which is its text's baseline tilt, so the mark points at its
 * line. The caret follows its text: no gesture resizes or turns it, though
 * straightening clears its turn.
 */
import type { Annotation } from '@embedpdf/engine-core/runtime';

import { bodyPieces } from '../painted';
import { normalizeDeg, rectCenter, rotatedAabb } from '../rect';
import type { Rect, RenderNode, TextEndAnchor } from '../types';
import { boxCorners, boxScaleAbout, boxTranslate, type TurnedBox } from './box';
import type { ShapeFamily } from './family';

/** A caret record's shape: the engine's box and its turn. */
export interface CaretShape extends TurnedBox {
  kind: 'caret';
}

/** A caret's shape, read off its annotation. */
function readCaret(annotation: Annotation): CaretShape {
  const { box, rotation } = annotation as Extract<Annotation, { subtype: 'caret' }>;
  return { kind: 'caret', box, rotation: rotation ?? 0 };
}

/** The engine fields that state `shape`: its `box` and `rotation` (`null` when upright). */
const writeCaret = (shape: CaretShape): { box: Rect; rotation: number | null } => ({
  box: shape.box,
  rotation: shape.rotation || null,
});

/**
 * The caret box for a text-edit anchor, upright: half the glyph's ink height,
 * centred on the trailing baseline corner in reading direction (`advance`
 * decides which end, so a right-to-left caret lands on the visual left),
 * sitting on the baseline. {@link caretFromAnchor} gives the turned caret.
 */
export function caretRectFromAnchor(anchor: TextEndAnchor): Rect {
  const quad = anchor.glyphQuad;
  const ink = Math.hypot(quad.lowerLeft.x - quad.upperLeft.x, quad.lowerLeft.y - quad.upperLeft.y);
  const size = Math.max(ink / 2, 1);
  const corner = anchor.advance > 0 ? quad.lowerRight : quad.lowerLeft;
  return { x: corner.x - size / 2, y: corner.y - size, width: size, height: size };
}

/** Rotations closer than ~0.05° to upright stay upright (float noise guard). */
const UPRIGHT_EPSILON = 0.05;

/**
 * The caret for a text-edit anchor: a box whose middle sits half a caret size
 * toward the ascent from the trailing baseline corner, turned by the text's
 * baseline tilt (degrees clockwise), so the mark hugs the turned baseline and
 * points at its text. For upright text this is exactly
 * {@link caretRectFromAnchor} with no turn.
 */
export function caretFromAnchor(anchor: TextEndAnchor): CaretShape {
  const quad = anchor.glyphQuad;
  const ink = Math.hypot(quad.lowerLeft.x - quad.upperLeft.x, quad.lowerLeft.y - quad.upperLeft.y);
  const size = Math.max(ink / 2, 1);
  const corner = anchor.advance > 0 ? quad.lowerRight : quad.lowerLeft;
  // The caret's own orientation follows the text (the symbol points at its
  // line regardless of reading direction), so the tilt comes from the
  // baseline edge, not from `advance`.
  const bx = quad.lowerRight.x - quad.lowerLeft.x;
  const by = quad.lowerRight.y - quad.lowerLeft.y;
  const rotation = Math.hypot(bx, by) > 0 ? normalizeDeg((Math.atan2(by, bx) * 180) / Math.PI) : 0;
  if (rotation < UPRIGHT_EPSILON || rotation > 360 - UPRIGHT_EPSILON) {
    return { kind: 'caret', box: caretRectFromAnchor(anchor), rotation: 0 };
  }
  // The middle: the trailing corner + half a caret size toward the ascent.
  const ux = (quad.upperLeft.x - quad.lowerLeft.x) / ink;
  const uy = (quad.upperLeft.y - quad.lowerLeft.y) / ink;
  const cx = corner.x + (ux * size) / 2;
  const cy = corner.y + (uy * size) / 2;
  return {
    kind: 'caret',
    box: { x: cx - size / 2, y: cy - size / 2, width: size, height: size },
    rotation,
  };
}

/** The width of the caret mark's outline, whatever the annotation's stroke. */
export const CARET_STROKE_WIDTH = 0.5;

/**
 * The caret mark in its box, before its turn (the renderer turns it about the
 * box's middle): filled, and its outline stroked from one foot over the peak
 * to the other, as the engine draws it. The base isn't stroked.
 */
function caretScene(shape: CaretShape): RenderNode[] {
  const { x, y, width, height } = shape.box;
  const midX = x + width / 2;
  const bottom = y + height;
  const pathData = [
    `M ${x} ${bottom}`,
    `C ${x + width * 0.27} ${bottom} ${midX} ${y + height * 0.56} ${midX} ${y}`,
    `C ${midX} ${y + height * 0.56} ${x + width * 0.73} ${bottom} ${x + width} ${bottom}`,
  ].join(' ');
  return [{ kind: 'path', d: pathData }];
}

/**
 * What the caret draws, before its turn: its box, and the outline's half
 * width below its base. The outline runs flat at each foot (a butt end
 * reaches across it, down) and doubles back at the peak (the renderer bevels
 * it, so nothing reaches above).
 */
function caretDrawnBounds(shape: CaretShape): Rect {
  const { box } = shape;
  return { ...box, height: box.height + CARET_STROKE_WIDTH / 2 };
}

/**
 * The caret family: a mark in a turned box that follows its text. It moves
 * and scales with a selection, but no gesture turns, resizes or drags it.
 */
export const caretFamily: ShapeFamily<CaretShape> = {
  read: readCaret,
  write: writeCaret,
  // A caret is made from a text selection, never placed.
  placed: () => null,
  bounds: (shape) => shape.box,
  drawnBounds: caretDrawnBounds,
  rect: (shape) => rotatedAabb(caretDrawnBounds(shape), shape.rotation, rectCenter(shape.box)),
  selectionBounds: (shape) => shape.box,
  oriented: () => true,
  turnedCorners: boxCorners,
  pivot: (shape) => rectCenter(shape.box),
  translate: boxTranslate,
  rotateAbout: (shape) => shape,
  scaleAbout: boxScaleAbout,
  upright: (shape) => ({ ...shape, rotation: 0 }),
  handles: () => [],
  drag: (shape) => shape,
  // A caret paints its whole box: the mark is small.
  painted: (shape) => bodyPieces(boxCorners(shape)),
  scene: caretScene,
};
