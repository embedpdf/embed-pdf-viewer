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
 * promotion. A page with nothing inline is left as it is.
 *
 * Call it before the write loads its page: a page loaded earlier still holds
 * the inline entries, so a promotion closes the pages no job holds.
 */
export function promoteInlineAnnotations(
  runtime: PdfRuntimeModule,
  session: DocumentSession,
  pageObjectNumber: PageObjectNumber,
): void {
  const { pageIndex } = session.resolvePageRef(toPageRef(pageObjectNumber));
  const moved = runtime.fn.EPDFPage_PromoteInlineAnnotsRaw(session.requireDocPtr(), pageIndex);
  if (moved < 0) {
    throw new EngineError(
      EngineErrorCode.Unknown,
      `the inline annotations of page ${pageObjectNumber} could not be promoted`,
    );
  }
  if (moved === 0) return;
  session.pagePool().closeIdle();
  // Every annotation on the page has an object number now.
  session.recordWeakFlag(pageObjectNumber, false);
}
