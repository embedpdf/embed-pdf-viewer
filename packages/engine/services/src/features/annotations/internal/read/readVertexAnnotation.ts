import type {
  AnnotationBase,
  PdfPoint,
  PolygonAnnotationDTO,
  PolylineAnnotationDTO,
  ShapeDimensionCaption,
  VertexAnnotationFields,
} from '@embedpdf/engine-core/runtime';
import type { PdfFunctions, PdfRuntimeMemory, Ptr } from '@embedpdf/engine-runtime';

import { readIntent } from './annotationReadPrimitives';
import { polygonIntentFromName, polylineIntentFromName } from '../measurementIntent';
import { readBorderEffect, readLineEndings, readVertices } from './annotationReadPrimitives';
import { readAnnotationRotation } from './readAnnotationTransformMetadata';
import { readAnnotationMeasure, readShapeCaption } from './readMeasurementFields';
import { readFilledStyleExtras } from './readStyle';

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
    rotation: rotation ?? null,
  };
}

export function readPolygon(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  base: AnnotationBase,
): PolygonAnnotationDTO {
  const caption = readShapeCaption(fn, mem, annotPtr);
  const intent = readIntent(fn, mem, annotPtr);
  return {
    ...base,
    ...readAnnotationMeasure(fn, mem, annotPtr),
    ...shapeCaptionFieldsOf(caption),
    intent: polygonIntentFromName(intent),
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
  const caption = readShapeCaption(fn, mem, annotPtr);
  const intent = readIntent(fn, mem, annotPtr);
  return {
    ...base,
    ...readAnnotationMeasure(fn, mem, annotPtr),
    ...shapeCaptionFieldsOf(caption),
    intent: polylineIntentFromName(intent),
    subtype: 'polyline',
    ...readVertexExtras(fn, mem, annotPtr),
    lineEndings: readLineEndings(fn, mem, annotPtr),
  };
}

/** A shape without our caption flag reads `captionEnabled: null`, so an imported shape keeps its appearance. */
function shapeCaptionFieldsOf(caption: ShapeDimensionCaption | undefined): {
  captionEnabled: boolean | null;
  captionCenter: PdfPoint | null;
} {
  return { captionEnabled: caption?.enabled ?? null, captionCenter: caption?.center ?? null };
}
