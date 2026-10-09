import type { AnnotationRef } from '@embedpdf/engine-core/runtime';
import { EngineError, EngineErrorCode } from '@embedpdf/engine-core/runtime';
import type { PdfRuntimeModule, Ptr } from '@embedpdf/engine-runtime';

import type { DocumentSession } from '../../../../document-session/DocumentSession';
import { resolveAnnotIndexRaw } from './resolveAnnotIndexRaw';

/**
 * Resolve an `AnnotationRef` to a live `annotPtr` on an already-acquired
 * `pagePtr`, for a write that changes the page's content (flatten,
 * redaction). Found the way {@link resolveAnnotIndexRaw} finds it; the
 * position is the same in the loaded page's `/Annots`. This does not
 * acquire/release the page and does not close the returned annot — the
 * caller owns both lifetimes. `NotFound` when nothing on the page has the
 * name.
 */
export function resolveAnnotPtr(
  runtime: PdfRuntimeModule,
  session: DocumentSession,
  pagePtr: Ptr,
  ref: AnnotationRef,
): Ptr {
  const { index } = resolveAnnotIndexRaw(runtime, session, ref);
  const annotPtr = runtime.fn.FPDFPage_GetAnnot(pagePtr, index);
  if (!annotPtr) {
    throw new EngineError(
      EngineErrorCode.Unknown,
      `annotation ${index} of page ${ref.page.objectNumber} could not be opened`,
    );
  }
  return annotPtr;
}
