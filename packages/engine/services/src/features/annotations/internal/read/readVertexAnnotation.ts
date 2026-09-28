import type {
  AnnotationBase,
  PdfPoint,
  PolygonAnnotationDTO,
  PolylineAnnotationDTO,
  VertexAnnotationFields,
  PdfCoordinates,
} from '@embedpdf/engine-core/runtime';
import type { PdfFunctions, PdfRuntimeMemory, Ptr } from '@embedpdf/engine-runtime';

import { polygonIntentFromName, polylineIntentFromName } from '../measurementIntent';
import { readIntent } from './annotationReadPrimitives';
import { readBorderEffect, readLineEndings, readVertices } from './annotationReadPrimitives';
import { readAnnotationMeasure, readShapeCaption } from './readMeasurementFields';
import { readPointsTurn, uprightPoint } from './readPointsTurn';
import { readFilledStyleExtras } from './readStyle';

/**
 * Shared reader for the two vertex subtypes (polygon/polyline): the
 * `/Vertices` upright, the turn that draws them (`readPointsTurn`), and a
 * manual caption center turned back with them. Each caller layers its own
 * subtype-specific extras (polygon: cloudy border; polyline: line endings)
 * and the `subtype` literal.
 */
function readVertexGeometry(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
): Pick<VertexAnnotationFields<PdfCoordinates>, 'vertices' | 'rotation'> & {
  captionEnabled: boolean | null;
  captionCenter: PdfPoint | null;
} {
  const drawn = readVertices(fn, mem, annotPtr);
  const turn = readPointsTurn(fn, mem, annotPtr, [drawn]);
  const caption = readShapeCaption(fn, mem, annotPtr);
  return {
    vertices: drawn.map((point) => uprightPoint(point, turn)),
    rotation: turn?.degrees ?? null,
    captionEnabled: caption?.enabled ?? null,
    captionCenter: caption?.center ? uprightPoint(caption.center, turn) : null,
  };
}

export function readPolygon(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  base: AnnotationBase<PdfCoordinates>,
): PolygonAnnotationDTO<PdfCoordinates> {
  const { captionEnabled, captionCenter, ...geometry } = readVertexGeometry(fn, mem, annotPtr);
  const intent = readIntent(fn, mem, annotPtr);
  return {
    ...base,
    ...readAnnotationMeasure(fn, mem, annotPtr),
    captionEnabled,
    captionCenter,
    intent: polygonIntentFromName(intent),
    subtype: 'polygon',
    ...readFilledStyleExtras(fn, mem, annotPtr),
    ...geometry,
    // Absent /BE reads as explicit `null` (never omission), so a read DTO
    // compares structurally against a clearing patch.
    cloudyIntensity: readBorderEffect(fn, mem, annotPtr),
  };
}

export function readPolyline(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  base: AnnotationBase<PdfCoordinates>,
): PolylineAnnotationDTO<PdfCoordinates> {
  const { captionEnabled, captionCenter, ...geometry } = readVertexGeometry(fn, mem, annotPtr);
  const intent = readIntent(fn, mem, annotPtr);
  return {
    ...base,
    ...readAnnotationMeasure(fn, mem, annotPtr),
    captionEnabled,
    captionCenter,
    intent: polylineIntentFromName(intent),
    subtype: 'polyline',
    ...readFilledStyleExtras(fn, mem, annotPtr),
    ...geometry,
    lineEndings: readLineEndings(fn, mem, annotPtr),
  };
}

/** A shape without our caption flag reads `captionEnabled: null`, so an imported shape keeps its appearance. */
