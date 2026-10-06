import type {
  AnnotationBase,
  PopupAnnotation,
  PdfCoordinates,
} from '@embedpdf/engine-core/runtime';
import type { PdfFunctions, PdfRuntimeMemory, Ptr } from '@embedpdf/engine-runtime';

import { readAnnotBoolean } from './annotationReadPrimitives';
import type { AnnotationReadContext } from './annotationReadContext';
import { readLinkedAnnotationRef } from './readAnnotationRelationship';

/** A popup: the window that shows its `/Parent` annotation's text. */
export function readPopup(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  base: AnnotationBase<PdfCoordinates>,
  _subtypeCode: number,
  ctx: AnnotationReadContext,
): PopupAnnotation<PdfCoordinates> {
  return {
    ...base,
    subtype: 'popup',
    parent: readLinkedAnnotationRef(
      fn,
      mem,
      ctx.docPtr,
      annotPtr,
      'Parent',
      base.page.objectNumber,
    ),
    open: readAnnotBoolean(fn, mem, annotPtr, 'Open') ?? false,
  };
}
