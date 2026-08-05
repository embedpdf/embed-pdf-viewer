import type { AnnotationBase, InkAnnotationDTO } from '@embedpdf/engine-core/runtime';
import type { PdfFunctions, PdfRuntimeMemory, Ptr } from '@embedpdf/engine-runtime';

import { readInkList, readIntent } from './annotationReadPrimitives';
import { readGeometryStyleExtras } from './readStyle';
import { readAnnotationRotation } from './readAnnotationTransformMetadata';
import { inkIntentFromName } from '../inkIntent';

export function readInk(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  base: AnnotationBase,
): InkAnnotationDTO {
  const rotation = readAnnotationRotation(fn, mem, annotPtr);
  const intent = inkIntentFromName(readIntent(fn, mem, annotPtr));
  return {
    ...base,
    subtype: 'ink',
    ...readGeometryStyleExtras(fn, mem, annotPtr),
    intent,
    inkList: readInkList(fn, mem, annotPtr),
    ...(rotation != null ? { rotation } : {}),
  };
}
