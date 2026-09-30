/**
 * Every shape family, and the family of any shape. A kind names the family
 * that reads its shape off the annotation (`kinds/`); from then on the shape
 * itself says which family answers for it, by its `kind`.
 */
import type { AnnotationDTO } from '@embedpdf/engine-core/runtime';

import type { Shape } from '../types';
import { boxFamily } from './box';
import { caretFamily } from './caret';
import type { ShapeFamily } from './family';
import { pointsFamily } from './points';
import { quadsFamily } from './quads';
import { textBoxFamily } from './text-box';

export type { Corners, ShapeFamily } from './family';
export { boxFamily, caretFamily, pointsFamily, quadsFamily, textBoxFamily };

/** The family that answers for each kind of shape: the points family for lines, polys and ink. */
const FAMILY_OF: Record<Shape['kind'], ShapeFamily> = {
  box: boxFamily,
  caret: caretFamily,
  'text-box': textBoxFamily,
  quads: quadsFamily,
  line: pointsFamily,
  poly: pointsFamily,
  ink: pointsFamily,
};

/**
 * The family that answers for `shape`. Each family works on its own shapes
 * only; looking it up by the shape's `kind` is what hands it one.
 */
export const familyOf = (shape: Shape): ShapeFamily => FAMILY_OF[shape.kind];

/**
 * The family of a kind whose annotation says which shape it has: `pick`
 * names the family that reads it, and the shape's own family does the rest.
 */
export function familyChosenBy(pick: (annotation: AnnotationDTO) => ShapeFamily): ShapeFamily {
  return {
    read: (annotation) => pick(annotation).read(annotation),
    write: (shape, subtype) => familyOf(shape).write(shape, subtype),
    placed: (placement, annotation) => pick(annotation).placed(placement, annotation),
    bounds: (shape) => familyOf(shape).bounds(shape),
    drawnBounds: (shape, stroke) => familyOf(shape).drawnBounds(shape, stroke),
    rect: (shape, stroke) => familyOf(shape).rect(shape, stroke),
    selectionBounds: (shape, stroke) => familyOf(shape).selectionBounds(shape, stroke),
    oriented: (shape) => familyOf(shape).oriented(shape),
    turnedCorners: (shape, stroke) => familyOf(shape).turnedCorners(shape, stroke),
    pivot: (shape) => familyOf(shape).pivot(shape),
    translate: (shape, delta) => familyOf(shape).translate(shape, delta),
    rotateAbout: (shape, pivot, degrees) => familyOf(shape).rotateAbout(shape, pivot, degrees),
    scaleAbout: (shape, anchor, sx, sy) => familyOf(shape).scaleAbout(shape, anchor, sx, sy),
    upright: (shape, pivot) => familyOf(shape).upright(shape, pivot),
    handleSpread: (shape, frame, page) => familyOf(shape).handleSpread(shape, frame, page),
    handles: (shape, spread) => familyOf(shape).handles(shape, spread),
    drag: (shape, handle, to, spread) => familyOf(shape).drag(shape, handle, to, spread),
    painted: (shape, stroke, filled) => familyOf(shape).painted(shape, stroke, filled),
    scene: (shape, stroke) => familyOf(shape).scene(shape, stroke),
  };
}
