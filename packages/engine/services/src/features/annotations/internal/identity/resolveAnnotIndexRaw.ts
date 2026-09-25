import { EngineError, EngineErrorCode, type AnnotationRef } from '@embedpdf/engine-core/runtime';
import type { PdfRuntimeModule } from '@embedpdf/engine-runtime';

import type { DocumentSession } from '../../../../document-session/DocumentSession';
import { annotationIndexByName } from '../read/annotationIndexByName';

/**
 * Where the annotation `ref` names is: its page's index and its place in the
 * page's `/Annots`, found from the page's dictionaries without loading the
 * page. `InvalidReference` when it isn't there, as {@link resolveAnnotPtr}.
 */
export function resolveAnnotIndexRaw(
  runtime: PdfRuntimeModule,
  session: DocumentSession,
  ref: AnnotationRef,
): { pageIndex: number; index: number } {
  const { fn } = runtime;
  const docPtr = session.requireDocPtr();
  const { pageIndex } = session.resolvePageRef(ref.page);
  const page = ref.page.pageObjectNumber;
  switch (ref.kind) {
    case 'objectNumber': {
      const index = fn.EPDFPage_GetAnnotIndexByObjectNumberRaw(
        docPtr,
        pageIndex,
        ref.annotObjectNumber,
      );
      if (index < 0) {
        throw new EngineError(
          EngineErrorCode.InvalidReference,
          `no annotation with object number ${ref.annotObjectNumber} on page ${page}`,
        );
      }
      return { pageIndex, index };
    }
    case 'nm': {
      const index = annotationIndexByName(runtime, docPtr, pageIndex, ref.nm);
      if (index < 0) {
        throw new EngineError(
          EngineErrorCode.InvalidReference,
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
