import {
  EngineError,
  EngineErrorCode,
  toPageRef,
  type PageObjectNumber,
} from '@embedpdf/engine-core/runtime';
import type { PdfRuntimeModule } from '@embedpdf/engine-runtime';

import type { DocumentSession } from '../../../../document-session/DocumentSession';

/**
 * Make each inline annotation on a page an object, in place, before a write
 * that moves entries of the page's `/Annots`: a delete, a reorder, a flatten,
 * a redaction. An inline annotation is named by its position, which holds
 * while no entry has moved; the layer records those positions at the first
 * promotion. A page with nothing inline is left as it is. Returns whether
 * the page changed: a promotion is a write, which the job reports even when
 * the write it prepared for finds nothing to do.
 *
 * Call it before the write loads its page: a page loaded earlier still holds
 * the inline entries, so a promotion closes the pages no job holds.
 */
export function promoteInlineAnnotations(
  runtime: PdfRuntimeModule,
  session: DocumentSession,
  pageObjectNumber: PageObjectNumber,
): boolean {
  const { pageIndex } = session.resolvePageRef(toPageRef(pageObjectNumber));
  const moved = runtime.fn.EPDFPage_PromoteInlineAnnotsRaw(session.requireDocPtr(), pageIndex);
  if (moved < 0) {
    throw new EngineError(
      EngineErrorCode.Unknown,
      `the inline annotations of page ${pageObjectNumber} could not be promoted`,
    );
  }
  if (moved === 0) return false;
  session.pagePool().closeIdle();
  return true;
}
