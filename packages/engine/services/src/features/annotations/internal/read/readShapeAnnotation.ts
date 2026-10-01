import type {
  AnnotationBase,
  CircleAnnotation,
  ShapeAnnotationFields,
  SquareAnnotation,
  PdfCoordinates,
} from '@embedpdf/engine-core/runtime';
import type { PdfFunctions, PdfRuntimeMemory, Ptr } from '@embedpdf/engine-runtime';

import { readBorderEffect } from './annotationReadPrimitives';
import { readAnnotationBox } from './readAnnotationTurn';
import { readFilledStyleExtras } from './readStyle';

/**
 * Shared reader for the two shape subtypes. Materialises the common
 * stroke/fill styling, the box and its turn, and the cloudy (`/BE`)
 * intensity; the caller fills in the `subtype` literal. An absent `/BE`
 * reads as explicit `null` (never omission), so a read DTO compares
 * structurally against a clearing patch.
 */
export function readShapeExtras(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
): ShapeAnnotationFields<PdfCoordinates> {
  return {
    ...readFilledStyleExtras(fn, mem, annotPtr),
    ...readAnnotationBox(fn, mem, annotPtr),
    cloudyIntensity: readBorderEffect(fn, mem, annotPtr),
  };
}

export function readCircle(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  base: AnnotationBase<PdfCoordinates>,
): CircleAnnotation<PdfCoordinates> {
  return { ...base, subtype: 'circle', ...readShapeExtras(fn, mem, annotPtr) };
}

export function readSquare(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  base: AnnotationBase<PdfCoordinates>,
): SquareAnnotation<PdfCoordinates> {
  return { ...base, subtype: 'square', ...readShapeExtras(fn, mem, annotPtr) };
}
