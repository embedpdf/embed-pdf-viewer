import type {
  AnnotationBase,
  PolygonAnnotationDTO,
  PolylineAnnotationDTO,
  VertexAnnotationFields,
} from '@embedpdf/engine-core/runtime';
import type { PdfFunctions, PdfRuntimeMemory, Ptr } from '@embedpdf/engine-runtime';

import { readBorderEffect, readLineEndings, readVertices } from './annotationReadPrimitives';
import { readFilledStyleExtras } from './readStyle';
import { readAnnotationRotation } from './readAnnotationTransformMetadata';

/**
 * Shared reader for the two vertex subtypes (polygon/polyline). Reads the
 * common stroke/fill styling plus the `/Vertices` point list; each caller
 * layers its own subtype-specific extras (polygon: cloudy border; polyline:
 * line endings) and the `subtype` literal.
 */
export function readVertexExtras(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
): VertexAnnotationFields {
  const rotation = readAnnotationRotation(fn, mem, annotPtr);
  return {
    ...readFilledStyleExtras(fn, mem, annotPtr),
    vertices: readVertices(fn, mem, annotPtr),
    ...(rotation != null ? { rotation } : {}),
  };
}

export function readPolygon(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  base: AnnotationBase,
): PolygonAnnotationDTO {
  return {
    ...base,
    subtype: 'polygon',
    ...readVertexExtras(fn, mem, annotPtr),
    // Absent /BE reads as explicit `null` (never omission), so a read DTO
    // compares structurally against a clearing patch.
    cloudyIntensity: readBorderEffect(fn, mem, annotPtr),
  };
}

export function readPolyline(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  base: AnnotationBase,
): PolylineAnnotationDTO {
  return {
    ...base,
    subtype: 'polyline',
    ...readVertexExtras(fn, mem, annotPtr),
    lineEndings: readLineEndings(fn, mem, annotPtr),
  };
}
