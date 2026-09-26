import type { AnnotationList, PageObjectNumber } from '@embedpdf/engine-core/runtime';
import { concatAnnotationLists, EngineError, EngineErrorCode } from '@embedpdf/engine-core/runtime';
import type { PdfRuntimeModule } from '@embedpdf/engine-runtime';

import type { DocumentSession } from '../../document-session/DocumentSession';
import { throwIfAborted } from '../../shared/abort';
import type { FontRegistrar } from '../fonts/FontRegistrar';
import { collectPageAnnotations } from './internal/read/collectPageAnnotations';

/**
 * Whole-document and per-page raw read paths. Never acquires a pagePtr;
 * uses `EPDFPage_GetAnnotCountRaw` / `EPDFPage_GetAnnotRaw` /
 * `EPDFAnnot_GetObjectNumber` directly off the docPtr.
 *
 * Per-subtype dispatch is the same as the full reader (both share
 * `collectPageAnnotations`), so the wire shape `AnnotationDTO[]` is
 * identical between raw and full read paths for the subtypes that don't
 * actually need a pagePtr to materialise their fields.
 */
export class RawAnnotationReader {
  constructor(
    private readonly runtime: PdfRuntimeModule,
    private readonly session: DocumentSession,
    /** This thread's font registry: FreeText faces read back as keys. */
    private readonly fonts?: FontRegistrar,
  ) {}

  /** The given pages in their order, or every page in document order. */
  list(pages: readonly PageObjectNumber[] | undefined, signal: AbortSignal): AnnotationList {
    throwIfAborted(signal);
    if (pages === undefined) {
      this.session.ensureFullPageRegistry();
      pages = this.session.allRecords().map((record) => record.pageObjectNumber);
    }
    const lists: AnnotationList[] = [];
    for (const pageObjectNumber of pages) {
      throwIfAborted(signal);
      lists.push(this.listOne(pageObjectNumber, signal));
    }
    return concatAnnotationLists(lists);
  }

  listOne(pageObjectNumber: PageObjectNumber, signal: AbortSignal): AnnotationList {
    throwIfAborted(signal);
    const { fn } = this.runtime;
    const docPtr = this.session.requireDocPtr();
    const record = this.session.recordByObjectNumber(pageObjectNumber);

    const count = fn.EPDFPage_GetAnnotCountRaw(docPtr, record.pageIndex);
    if (count < 0) {
      throw new EngineError(
        EngineErrorCode.Unknown,
        `EPDFPage_GetAnnotCountRaw returned ${count} for page ${pageObjectNumber}`,
      );
    }

    return collectPageAnnotations({
      runtime: this.runtime,
      session: this.session,
      pageObjectNumber,
      count,
      getAnnotPtrAt: (i) => fn.EPDFPage_GetAnnotRaw(docPtr, record.pageIndex, i),
      signal,
      ...(this.fonts ? { fonts: this.fonts } : {}),
    });
  }
}
