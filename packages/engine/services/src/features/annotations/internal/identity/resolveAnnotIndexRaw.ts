import { EngineError, EngineErrorCode, type AnnotationRef } from '@embedpdf/engine-core/runtime';
import type { PdfRuntimeModule, Ptr } from '@embedpdf/engine-runtime';

import type { DocumentSession } from '../../../../document-session/DocumentSession';
import { annotationRefOf } from './annotationName';

/**
 * Where the annotation `ref` names is: its page's index and its place in the
 * page's `/Annots`, found from the page's dictionaries without loading the
 * page. `NotFound` when it isn't there.
 *
 * A `baseIndex` names an annotation born inline in the file. On a page the
 * layer promoted, the birth list gives the object it became; on any other
 * page it is still inline at that position (see `annotationRefOf`).
 */
export function resolveAnnotIndexRaw(
  runtime: PdfRuntimeModule,
  session: DocumentSession,
  ref: AnnotationRef,
): { pageIndex: number; index: number } {
  const { fn } = runtime;
  const docPtr = session.requireDocPtr();
  const { pageIndex } = session.resolvePageRef(ref.page);
  const page = ref.page.objectNumber;
  switch (ref.kind) {
    case 'objectNumber': {
      const index = fn.EPDFPage_GetAnnotIndexByObjectNumberRaw(docPtr, pageIndex, ref.objectNumber);
      if (index < 0) {
        throw new EngineError(
          EngineErrorCode.NotFound,
          `no annotation with object number ${ref.objectNumber} on page ${page}`,
        );
      }
      return { pageIndex, index };
    }
    case 'baseIndex': {
      const index = baseIndexPosition(runtime, docPtr, page, pageIndex, ref.baseIndex);
      if (index < 0) {
        throw new EngineError(
          EngineErrorCode.NotFound,
          `no annotation born at position ${ref.baseIndex} of page ${page}`,
        );
      }
      return { pageIndex, index };
    }
  }
}

/** Where the annotation born inline at `baseIndex` of a page is now, or -1. */
function baseIndexPosition(
  runtime: PdfRuntimeModule,
  docPtr: Ptr,
  pageObjectNumber: number,
  pageIndex: number,
  baseIndex: number,
): number {
  const { fn } = runtime;
  if (fn.EPDFLayer_IsPagePromoted(docPtr, pageObjectNumber)) {
    const objectNumber = fn.EPDFLayer_GetBirthObjectNumber(docPtr, pageObjectNumber, baseIndex);
    if (objectNumber <= 0) return -1;
    return fn.EPDFPage_GetAnnotIndexByObjectNumberRaw(docPtr, pageIndex, objectNumber);
  }
  if (baseIndex < 0 || baseIndex >= fn.EPDFPage_GetAnnotCountRaw(docPtr, pageIndex)) return -1;
  const annotPtr = fn.EPDFPage_GetAnnotRaw(docPtr, pageIndex, baseIndex);
  if (!annotPtr) return -1;
  try {
    // Only an inline entry still sits at its birth position.
    return fn.EPDFAnnot_GetObjectNumber(annotPtr) > 0 ? -1 : baseIndex;
  } finally {
    fn.FPDFPage_CloseAnnot(annotPtr);
  }
}

/**
 * The annotation `ref` names, opened from its page's `/Annots` without
 * loading the page ({@link resolveAnnotIndexRaw}). The caller closes it.
 */
export function openAnnotRaw(
  runtime: PdfRuntimeModule,
  session: DocumentSession,
  ref: AnnotationRef,
): Ptr {
  const { pageIndex, index } = resolveAnnotIndexRaw(runtime, session, ref);
  return openAnnotAtRaw(runtime, session, pageIndex, index);
}

/** The annotation at `index` of a page's `/Annots`, opened without loading the page. */
export function openAnnotAtRaw(
  runtime: PdfRuntimeModule,
  session: DocumentSession,
  pageIndex: number,
  index: number,
): Ptr {
  const annotPtr = runtime.fn.EPDFPage_GetAnnotRaw(session.requireDocPtr(), pageIndex, index);
  if (!annotPtr) {
    throw new EngineError(
      EngineErrorCode.Unknown,
      `annotation ${index} of page index ${pageIndex} could not be opened`,
    );
  }
  return annotPtr;
}

/**
 * The annotation `ref` names, opened raw, with the name the engine hands
 * out for it. The caller closes it.
 */
export function openNamedAnnotRaw(
  runtime: PdfRuntimeModule,
  session: DocumentSession,
  ref: AnnotationRef,
): { annotPtr: Ptr; name: AnnotationRef } {
  const { pageIndex, index } = resolveAnnotIndexRaw(runtime, session, ref);
  const annotPtr = openAnnotAtRaw(runtime, session, pageIndex, index);
  const { fn, mem } = runtime;
  const name = annotationRefOf(fn, mem, session.requireDocPtr(), ref.page, annotPtr, index);
  return { annotPtr, name };
}
