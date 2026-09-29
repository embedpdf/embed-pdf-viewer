/**
 * Every shape family, and the family of any shape. A kind names the family
 * that reads its shape off the annotation (`kinds/`); from then on the shape
 * itself says which family answers for it, by its `kind`.
 */
import type { AnnotationDTO } from '@embedpdf/engine-core/runtime';

import type { ModelGeometry } from '../types';
import { boxFamily } from './box';
import { caretFamily } from './caret';
import type { ShapeFamily } from './family';
import { pointsFamily } from './points';
import { quadsFamily } from './quads';
import { textBoxFamily } from './text-box';

export type { Corners, ShapeFamily } from './family';
export { boxFamily, caretFamily, pointsFamily, quadsFamily, textBoxFamily };

/** The family that answers for each kind of shape: the points family for lines, polys and ink. */
const FAMILY_OF: Record<ModelGeometry['kind'], ShapeFamily> = {
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
export const familyOf = (shape: ModelGeometry): ShapeFamily => FAMILY_OF[shape.kind];

/**
 * The family of a kind whose annotation says which shape it has: `pick`
 * names the family that reads it, and the shape's own family does the rest.
 */
export function familyChosenBy(pick: (annotation: AnnotationDTO) => ShapeFamily): ShapeFamily {
  return {
    read: (annotation) => pick(annotation).read(annotation),
    write: (shape, subtype) => familyOf(shape).write(shape, subtype),
    bounds: (shape) => familyOf(shape).bounds(shape),
    drawnBounds: (shape, strokeWidth, border) =>
      familyOf(shape).drawnBounds(shape, strokeWidth, border),
    selectionBounds: (shape, strokeWidth, border) =>
      familyOf(shape).selectionBounds(shape, strokeWidth, border),
    oriented: (shape) => familyOf(shape).oriented(shape),
    turnedCorners: (shape, strokeWidth, border) =>
      familyOf(shape).turnedCorners(shape, strokeWidth, border),
    pivot: (shape) => familyOf(shape).pivot(shape),
    translate: (shape, delta) => familyOf(shape).translate(shape, delta),
    rotateAbout: (shape, pivot, degrees) => familyOf(shape).rotateAbout(shape, pivot, degrees),
    scaleAbout: (shape, anchor, sx, sy) => familyOf(shape).scaleAbout(shape, anchor, sx, sy),
    upright: (shape, pivot) => familyOf(shape).upright(shape, pivot),
    handles: (shape) => familyOf(shape).handles(shape),
    drag: (shape, handle, to) => familyOf(shape).drag(shape, handle, to),
    hit: (shape, point, margin, filled, strokeWidth, border) =>
      familyOf(shape).hit(shape, point, margin, filled, strokeWidth, border),
    scene: (shape, strokeWidth, border) => familyOf(shape).scene(shape, strokeWidth, border),
  };
}
