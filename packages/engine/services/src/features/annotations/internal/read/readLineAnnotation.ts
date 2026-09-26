import type { AnnotationBase, LineAnnotationDTO } from '@embedpdf/engine-core/runtime';
import type { PdfFunctions, PdfRuntimeMemory, Ptr } from '@embedpdf/engine-runtime';

import { readIntent } from './annotationReadPrimitives';
import { lineIntentFromName } from '../measurementIntent';
import { readLine as readLinePoints, readLineEndings } from './annotationReadPrimitives';
import { readAnnotationRotation } from './readAnnotationTransformMetadata';
import { readAnnotationMeasure, readLineCaption, readLineLeader } from './readMeasurementFields';
import { readFilledStyleExtras } from './readStyle';

/** Fallback `/L` when the annotation has no line geometry. */
const ZERO_LINE = { start: { x: 0, y: 0 }, end: { x: 0, y: 0 } };

export function readLine(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  base: AnnotationBase,
): LineAnnotationDTO {
  const rotation = readAnnotationRotation(fn, mem, annotPtr);
  const intent = readIntent(fn, mem, annotPtr);
  const caption = readLineCaption(fn, mem, annotPtr);
  const leader = readLineLeader(fn, mem, annotPtr);
  return {
    ...base,
    ...readAnnotationMeasure(fn, mem, annotPtr),
    intent: lineIntentFromName(intent),
    // An absent `/Cap` reads `null`, as on polygons and polylines; `/CP`
    // reads its ISO default.
    captionEnabled: fn.FPDFAnnot_HasKey(annotPtr, 'Cap') ? (caption?.enabled ?? false) : null,
    captionPosition: caption?.position ?? 'inline',
    captionOffset: caption?.offset ?? null,
    leader: leader ?? null,
    subtype: 'line',
    ...readFilledStyleExtras(fn, mem, annotPtr),
    linePoints: readLinePoints(fn, mem, annotPtr) ?? ZERO_LINE,
    lineEndings: readLineEndings(fn, mem, annotPtr),
    rotation: rotation ?? null,
  };
}
