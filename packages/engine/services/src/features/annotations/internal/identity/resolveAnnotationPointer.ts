import type { AnnotationRef } from '@embedpdf/engine-core/runtime';
import { EngineError, EngineErrorCode } from '@embedpdf/engine-core/runtime';
import type { PdfRuntimeModule, Ptr } from '@embedpdf/engine-runtime';

import type { DocumentSession } from '../../../../document-session/DocumentSession';

/**
 * Resolve an `AnnotationRef` to a live `annotPtr` on an already-acquired
 * `pagePtr`. This does not acquire/release the page and does not close the
 * returned annot — the caller owns both lifetimes.
 *
 * Resolution order matches the wire spec:
 *   1. `objectNumber` -> `EPDFPage_GetAnnotByObjectNumber`
 *   2. `nm`           -> `EPDFPage_GetAnnotByName`
 *   3. `index`        -> revision validation, then `FPDFPage_GetAnnot`
 *
 * Fails fast, before any work: `NotFound` when no annotation on the page
 * has the number or name, `InvalidReference` for an index ref whose page
 * changed (stale revision, or out of range).
 */
export function resolveAnnotPtr(
  runtime: PdfRuntimeModule,
  session: DocumentSession,
  pagePtr: Ptr,
  ref: AnnotationRef,
): Ptr {
  const { fn, mem } = runtime;
  switch (ref.kind) {
    case 'objectNumber': {
      const annotPtr = fn.EPDFPage_GetAnnotByObjectNumber(pagePtr, ref.annotObjectNumber);
      if (!annotPtr) {
        throw new EngineError(
          EngineErrorCode.NotFound,
          `no annotation with object number ${ref.annotObjectNumber} on page ${ref.page.pageObjectNumber}`,
        );
      }
      return annotPtr;
    }
    case 'nm': {
      const namePtr = mem.writeU16String(ref.nm);
      try {
        const annotPtr = fn.EPDFPage_GetAnnotByName(pagePtr, namePtr);
        if (!annotPtr) {
          throw new EngineError(
            EngineErrorCode.NotFound,
            `no annotation with /NM '${ref.nm}' on page ${ref.page.pageObjectNumber}`,
          );
        }
        return annotPtr;
      } finally {
        mem.free(namePtr);
      }
    }
    case 'index': {
      session.validateRevision(ref.revision);
      const annotPtr = fn.FPDFPage_GetAnnot(pagePtr, ref.index);
      if (!annotPtr) {
        throw new EngineError(
          EngineErrorCode.InvalidReference,
          `index ${ref.index} out of range on page ${ref.page.pageObjectNumber}`,
        );
      }
      return annotPtr;
    }
  }
  throw new EngineError(EngineErrorCode.InvalidArg, `unsupported annotation ref kind`);
}
