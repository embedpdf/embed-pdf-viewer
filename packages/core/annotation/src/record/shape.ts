/**
 * An annotation's shape: its kind's family reads it off the annotation, and
 * a changed shape goes back as the engine fields that state it.
 */
import type { AnnotationDTO } from '@embedpdf/engine-core/runtime';

import { familyOf } from '../shapes';
import type { ModelAnnotation, Shape } from '../types';
import { kindOf } from './identity';
import { withValues } from './values';

const shapes = new WeakMap<AnnotationDTO, Shape>();

/**
 * The annotation's shape (`shapes/`), read by its kind's family. The same
 * shape for the same annotation, so what is worked out from a shape once
 * (where its points are drawn) is kept.
 */
export function shapeOf(annotation: AnnotationDTO): Shape {
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
