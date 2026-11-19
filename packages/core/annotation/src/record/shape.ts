/**
 * An annotation's shape: its kind's family reads it off the annotation, and
 * a changed shape goes back as the engine fields that state it.
 */
import type { Rotation } from '@embedpdf/core-geometry';
import type { Annotation } from '@embedpdf/engine-core/runtime';

import { standingRect } from '../rect';
import { familyOf } from '../shapes';
import type { ModelAnnotation, Rect, Shape } from '../types';
import { kindOf } from './identity';
import { withValues } from './values';

const shapes = new WeakMap<Annotation, Shape>();

/**
 * The annotation's shape (`shapes/`), read by its kind's family. The same
 * shape for the same annotation, so what is worked out from a shape once
 * (where its points are drawn) is kept.
 */
export function shapeOf(annotation: Annotation): Shape {
  let shape = shapes.get(annotation);
  if (!shape) {
    shape = kindOf(annotation).family.read(annotation);
    shapes.set(annotation, shape);
  }
  return shape;
}

/**
 * The record with its shape changed: the engine fields that state `shape`,
 * written through `withValues`. The same record when the shape is the one
 * it has, or when the record may not change now.
 */
export const withShape = (record: ModelAnnotation, shape: Shape): ModelAnnotation =>
  withValues(record, familyOf(shape).write(shape, record.annotation.subtype));

/**
 * The engine fields that turn a form widget's contents to `rotation` (a
 * quarter turn, clockwise) where it stands, as Acrobat's Orientation does:
 * its `rect` stays, and its `box`, the frame its contents are laid out in,
 * is that rect with its sides swapped at 90 and 270. Nothing for an
 * annotation that doesn't turn by quarter turns, so a mixed selection takes
 * it (`selection.update((annotation) => orientationPatch(annotation, 90))`).
 */
export function orientationPatch(
  annotation: Annotation,
  rotation: Rotation,
): { box: Rect; rotation: Rotation | null } | Record<string, never> {
  if (!kindOf(annotation).caps.quarterTurns) return {};
  const shape = shapeOf(annotation);
  if (shape.kind !== 'box') return {};
  const stands = standingRect(shape.box, shape.rotation);
  // The frame that stands in the same rect at the new turn: the inverse of standing.
  return { box: standingRect(stands, rotation), rotation: rotation || null };
}
