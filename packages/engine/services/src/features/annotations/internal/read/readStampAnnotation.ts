import type { AnnotationBase, StampAnnotationDTO } from '@embedpdf/engine-core/runtime';
import type { PdfFunctions, PdfRuntimeMemory, Ptr } from '@embedpdf/engine-runtime';

import { readAnnotName } from './annotationReadPrimitives';
import {
  readAnnotationRotation,
  readAnnotationUnrotatedRect,
} from './readAnnotationTransformMetadata';

/**
 * Stamp DTO: base + `/Name` (standard or custom identifier, verbatim) +
 * transform metadata. The visual content
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
    name: readAnnotName(fn, mem, annotPtr),
    ...(rotation != null ? { rotation } : {}),
    ...(unrotatedRect != null ? { unrotatedRect } : {}),
  };
}
