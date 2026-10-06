import { EngineError, EngineErrorCode, type AnnotationRef } from '@embedpdf/engine-core/runtime';
import type { PdfRuntimeModule, Ptr } from '@embedpdf/engine-runtime';

import type { DocumentSession } from '../../../../document-session/DocumentSession';
import { annotationIndexByName } from '../read/annotationIndexByName';

/**
 * Where the annotation `ref` names is: its page's index and its place in the
 * page's `/Annots`, found from the page's dictionaries without loading the
 * page. `NotFound` when it isn't there, `InvalidReference` for a stale index
 * ref, as {@link resolveAnnotPtr}.
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
    case 'nm': {
      const index = annotationIndexByName(runtime, docPtr, pageIndex, ref.nm);
      if (index < 0) {
        throw new EngineError(
          EngineErrorCode.NotFound,
          `no annotation with /NM '${ref.nm}' on page ${page}`,
        );
      }
      return { pageIndex, index };
    }
    case 'index': {
      session.validateRevision(ref.revision);
      if (ref.index < 0 || ref.index >= fn.EPDFPage_GetAnnotCountRaw(docPtr, pageIndex)) {
        throw new EngineError(
          EngineErrorCode.InvalidReference,
          `index ${ref.index} out of range on page ${page}`,
        );
      }
      return { pageIndex, index: ref.index };
    }
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
