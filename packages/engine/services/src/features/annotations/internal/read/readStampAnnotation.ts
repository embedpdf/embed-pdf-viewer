import type { AnnotationBase, StampAnnotationDTO } from '@embedpdf/engine-core/runtime';
import type { PdfFunctions, PdfRuntimeMemory, Ptr } from '@embedpdf/engine-runtime';

import { readAnnotName, readAnnotOpacity } from './annotationReadPrimitives';
import {
  readAnnotationRotation,
  readAnnotationUnrotatedRect,
} from './readAnnotationTransformMetadata';

/**
 * Stamp DTO: base + `/Name` (standard or custom identifier, verbatim) + `/CA`
 * opacity + transform metadata. The visual content
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
  const ca = readAnnotOpacity(fn, mem, annotPtr);
  const opacity = ca == null ? 1 : Math.max(0, Math.min(1, ca));
  return {
    ...base,
    subtype: 'stamp',
    name: readAnnotName(fn, mem, annotPtr),
    opacity,
    ...(rotation != null ? { rotation } : {}),
    ...(unrotatedRect != null ? { unrotatedRect } : {}),
  };
}
