import type { AnnotationBase, StampAnnotationDTO } from '@embedpdf/engine-core/runtime';
import type { PdfFunctions, PdfRuntimeMemory, Ptr } from '@embedpdf/engine-runtime';

import { STAMP_CODE_TO_NAME } from '../stampName';
import { readAnnotString } from './annotationReadPrimitives';
import {
  readAnnotationRotation,
  readAnnotationUnrotatedRect,
} from './readAnnotationTransformMetadata';

/**
 * Stamp DTO: base + `/Name` label + transform metadata. The visual content
 * stays in the `/AP` stream — rendered via `renderAppearanceImages()`,
 * never surfaced as DTO data.
 */
export function readStamp(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  base: AnnotationBase,
): StampAnnotationDTO {
  const rotation = readAnnotationRotation(fn, mem, annotPtr);
  const unrotatedRect = readAnnotationUnrotatedRect(fn, mem, annotPtr);
  return {
    ...base,
    subtype: 'stamp',
    name: readStampName(fn, mem, annotPtr),
    ...(rotation != null ? { rotation } : {}),
    ...(unrotatedRect != null ? { unrotatedRect } : {}),
  };
}

function readStampName(fn: PdfFunctions, mem: PdfRuntimeMemory, annotPtr: Ptr): string | null {
  const code = fn.EPDFAnnot_GetName(annotPtr);
  const known = STAMP_CODE_TO_NAME[code];
  if (known !== undefined) return known;
  // Custom /Name values fall outside the fork's enum; try the raw entry.
  return readAnnotString(fn, mem, annotPtr, 'Name');
}
