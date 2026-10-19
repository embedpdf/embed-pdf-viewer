import type { AnnotationBase, LineAnnotation, PdfCoordinates } from '@embedpdf/engine-core/runtime';
import type { PdfFunctions, PdfRuntimeMemory, Ptr } from '@embedpdf/engine-runtime';

import { lineIntentFromName } from '../measurementIntent';
import { readIntent } from './annotationReadPrimitives';
import { readLine as readLinePoints, readLineEndings } from './annotationReadPrimitives';
import { readAnnotationMeasure, readLineCaption, readLineLeader } from './readMeasurementFields';
import { readPointsTurn, uprightPoint } from './readPointsTurn';
import { readFilledStyleExtras } from './readStyle';

/** Fallback `/L` when the annotation has no line geometry. */
const ZERO_LINE = { start: { x: 0, y: 0 }, end: { x: 0, y: 0 } };

export function readLine(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  base: AnnotationBase<PdfCoordinates>,
): LineAnnotation<PdfCoordinates> {
  const drawn = readLinePoints(fn, mem, annotPtr) ?? ZERO_LINE;
  // The points upright, and the turn that draws them.
  const turn = readPointsTurn(fn, mem, annotPtr, [[drawn.start, drawn.end]]);
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
    linePoints: { start: uprightPoint(drawn.start, turn), end: uprightPoint(drawn.end, turn) },
    lineEndings: readLineEndings(fn, mem, annotPtr),
    rotation: turn?.degrees ?? null,
  };
}
