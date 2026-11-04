import type {
  AnnotationBase,
  StampAnnotation,
  PdfCoordinates,
} from '@embedpdf/engine-core/runtime';
import type { PdfFunctions, PdfRuntimeMemory, Ptr } from '@embedpdf/engine-runtime';

import { readAppearanceFit } from '../appearanceFit';
import { readCommentRichText } from '../richTextWire';
import { readAnnotName, readAnnotOpacity } from './annotationReadPrimitives';
import { readAnnotationBox } from './readAnnotationTurn';

/**
 * Stamp DTO: base + `/Name` (standard or custom identifier, verbatim) +
 * its box and turn + the recorded fit + `/CA`. The visual content
 * stays in the `/AP` stream — rendered via `renderAppearances()`,
 * never surfaced as DTO data.
 */
export function readStamp(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  base: AnnotationBase<PdfCoordinates>,
): StampAnnotation<PdfCoordinates> {
  return {
    ...base,
    richText: readCommentRichText(fn, mem, annotPtr),
    subtype: 'stamp',
    name: readAnnotName(fn, mem, annotPtr),
    fit: readAppearanceFit(fn, mem, annotPtr),
    opacity: readAnnotOpacity(fn, mem, annotPtr) ?? 1,
    ...readAnnotationBox(fn, mem, annotPtr),
  };
}
