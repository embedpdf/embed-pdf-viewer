import type { AnnotationBase, PopupAnnotationDTO } from '@embedpdf/engine-core/runtime';
import type { PdfFunctions, PdfRuntimeMemory, Ptr } from '@embedpdf/engine-runtime';

import { readAnnotBoolean } from './annotationReadPrimitives';
import { readLinkedAnnotationRef } from './readAnnotationRelationship';

/** A popup: the window that shows its `/Parent` annotation's text. */
export function readPopup(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  base: AnnotationBase,
): PopupAnnotationDTO {
  return {
    ...base,
    subtype: 'popup',
    parent: readLinkedAnnotationRef(fn, mem, annotPtr, 'Parent', base.page.pageObjectNumber),
    open: readAnnotBoolean(fn, mem, annotPtr, 'Open') ?? false,
  };
}
