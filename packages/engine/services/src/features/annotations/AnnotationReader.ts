import type { AnnotationList, PageObjectNumber } from '@embedpdf/engine-core/runtime';
import type { PdfRuntimeModule } from '@embedpdf/engine-runtime';

import type { DocumentSession } from '../../document-session/DocumentSession';
import { throwIfAborted } from '../../shared/abort';
import type { FontRegistrar } from '../fonts/FontRegistrar';
import { collectPageAnnotations } from './internal/read/collectPageAnnotations';

/**
 * Per-page slow-path reader. Acquires a `pagePtr` from the
 * `PagePtrPool`, dispatches the same per-subtype catalog as the raw
 * reader (via `collectPageAnnotations`), and releases the page on exit.
 *
 * Currently the dispatched readers do not use the `pagePtr` parameter
 * (text-markup is fully readable from the dict). Subtype readers that
 * need form/widget access (e.g. widget) will plug into this code path
 * as they land - the public DTO surface stays the same.
 */
export class AnnotationReader {
  constructor(
    private readonly runtime: PdfRuntimeModule,
    private readonly session: DocumentSession,
    /** This thread's font registry: FreeText faces read back as keys. */
    private readonly fonts?: FontRegistrar,
  ) {}

  list(pageObjectNumber: PageObjectNumber, signal: AbortSignal): AnnotationList {
    throwIfAborted(signal);
    const { fn } = this.runtime;
    const pool = this.session.pagePool();
    const pagePtr = pool.acquire(pageObjectNumber);

    try {
      const count = fn.FPDFPage_GetAnnotCount(pagePtr);
      return collectPageAnnotations({
        runtime: this.runtime,
        session: this.session,
        pageObjectNumber,
        count,
        getAnnotPtrAt: (i) => fn.FPDFPage_GetAnnot(pagePtr, i),
        signal,
        ...(this.fonts ? { fonts: this.fonts } : {}),
      });
    } finally {
      pool.release(pageObjectNumber);
    }
  }
}
