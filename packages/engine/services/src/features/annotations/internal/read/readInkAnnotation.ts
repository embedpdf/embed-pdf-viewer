import type {
  AnnotationBase,
  InkAnnotationDTO,
  PdfCoordinates,
} from '@embedpdf/engine-core/runtime';
import type { PdfFunctions, PdfRuntimeMemory, Ptr } from '@embedpdf/engine-runtime';

import { readInkList, readIntent } from './annotationReadPrimitives';
import { readPointsTurn, uprightPoint } from './readPointsTurn';
import { readGeometryStyleExtras } from './readStyle';
import { inkIntentFromName } from '../inkIntent';

export function readInk(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  base: AnnotationBase<PdfCoordinates>,
): InkAnnotationDTO<PdfCoordinates> {
  const drawn = readInkList(fn, mem, annotPtr);
  // The strokes upright, and the turn that draws them.
  const turn = readPointsTurn(fn, mem, annotPtr, drawn);
  const intent = inkIntentFromName(readIntent(fn, mem, annotPtr));
  return {
    ...base,
    subtype: 'ink',
    ...readGeometryStyleExtras(fn, mem, annotPtr),
    intent,
    inkList: drawn.map((stroke) => stroke.map((point) => uprightPoint(point, turn))),
    rotation: turn?.degrees ?? null,
  };
}
