import type { PdfRuntimeModule, Ptr } from '@embedpdf/engine-runtime';

import { readAnnotString } from './annotationReadPrimitives';

/**
 * Whether a page has a weak annotation: one with no object number and no
 * `/NM`, which only its position names. Read from the page's dictionaries,
 * so no page is loaded.
 */
export function pageHasWeakAnnotations(
  runtime: PdfRuntimeModule,
  docPtr: Ptr,
  pageIndex: number,
): boolean {
  const { fn, mem } = runtime;
  const count = fn.EPDFPage_GetAnnotCountRaw(docPtr, pageIndex);
  for (let index = 0; index < count; index++) {
    const annotPtr = fn.EPDFPage_GetAnnotRaw(docPtr, pageIndex, index);
    if (!annotPtr) continue;
    try {
      if (
        fn.EPDFAnnot_GetObjectNumber(annotPtr) <= 0 &&
        !readAnnotString(fn, mem, annotPtr, 'NM')
      ) {
        return true;
      }
    } finally {
      fn.FPDFPage_CloseAnnot(annotPtr);
    }
  }
  return false;
}
