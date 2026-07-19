import type {
  AnnotationListPageSnapshot,
  AnnotationListSnapshotAllPages,
  PageObjectNumber,
} from '@embedpdf/engine-core/runtime';
import { EngineError, EngineErrorCode } from '@embedpdf/engine-core/runtime';
import type { PdfRuntimeModule } from '@embedpdf/engine-runtime';

import type { DocumentSession } from '../../document-session/DocumentSession';
import { throwIfAborted } from '../../shared/abort';
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
  ) {}

  listAll(signal: AbortSignal): AnnotationListSnapshotAllPages {
    throwIfAborted(signal);
    this.session.ensureFullPageRegistry();
    const records = this.session.allRecords();
    const pages: AnnotationListPageSnapshot[] = [];
    for (const record of records) {
      throwIfAborted(signal);
      pages.push(this.listOne(record.pageObjectNumber, signal));
    }
    return { pages };
  }

  listOne(pageObjectNumber: PageObjectNumber, signal: AbortSignal): AnnotationListPageSnapshot {
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
    });
  }
}
