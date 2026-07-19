import { EngineError, EngineErrorCode, type PageObjectNumber } from '@embedpdf/engine-core/runtime';
import type { PdfRuntimeModule, Ptr } from '@embedpdf/engine-runtime';

import type { DocumentSession } from '../../document-session/DocumentSession';
import { throwIfAborted } from '../../shared/abort';

const FPDF_NO_INCREMENTAL = 1 << 1;

/**
 * Export a subset of pages as a standalone PDF. A READ over the session:
 * `FPDF_ImportPagesByIndex` copies pages into a scratch document, so the
 * source is untouched — no revision bumps, no registry refresh, no layer
 * artifact. Lives next to `PagesReader`/`PagesMutator` (one file per page
 * verb family) so both worker hosts share the code path.
 */
export class PagesExtractor {
  constructor(
    private readonly runtime: PdfRuntimeModule,
    private readonly session: DocumentSession,
  ) {}

  /**
   * Copy the given pages, in the supplied caller order, into a new
   * document and serialize it. Validation up front: non-empty, no
   * duplicates, every PON resolvable (`NotFound` from the session on a
   * bad one). The scratch document is always closed, success or throw.
   */
  extract(
    pageObjectNumbers: PageObjectNumber[],
    signal: AbortSignal,
  ): { bytes: ArrayBuffer; size: number } {
    throwIfAborted(signal);
    if (pageObjectNumbers.length === 0) {
      throw new EngineError(EngineErrorCode.InvalidArg, 'pages.extract requires at least one page');
    }
    const seen = new Set<PageObjectNumber>();
    for (const pon of pageObjectNumbers) {
      if (seen.has(pon)) {
        throw new EngineError(
          EngineErrorCode.InvalidArg,
          `pages.extract was given duplicate page object number ${pon}`,
        );
      }
      seen.add(pon);
    }

    // Resolve every pon to its CURRENT index via the session registry —
    // NotFound on caller error, and caller order is preserved in the output.
    const indices = pageObjectNumbers.map(
      (pon) => this.session.recordByObjectNumber(pon).pageIndex,
    );

    const { fn, mem } = this.runtime;
    const srcPtr = this.session.requireDocPtr();

    const destPtr = fn.FPDF_CreateNewDocument();
    if (!destPtr) {
      throw new EngineError(EngineErrorCode.Unknown, 'FPDF_CreateNewDocument failed');
    }
    const idxPtr = mem.alloc(4 * indices.length);
    const sizePtr = mem.alloc(4);
    let pdfPtr: Ptr | null = null;
    try {
      for (let i = 0; i < indices.length; i++) {
        mem.poke(idxPtr, 'i32', indices[i], 4 * i);
      }
      if (!fn.FPDF_ImportPagesByIndex(destPtr, srcPtr, idxPtr, indices.length, 0)) {
        throw new EngineError(
          EngineErrorCode.Unknown,
          `FPDF_ImportPagesByIndex rejected the request (indices=[${indices.join(',')}])`,
        );
      }

      mem.poke(sizePtr, 'i32', 0);
      pdfPtr = fn.EPDF_SaveDocumentToOwnedBuffer(destPtr, FPDF_NO_INCREMENTAL, sizePtr);
      const size = Number(mem.peek(sizePtr, 'i32'));
      if (!pdfPtr || size <= 0) {
        throw new EngineError(EngineErrorCode.DocOpenFailed, 'failed to save extracted pages');
      }

      const bytes = mem.readBytes(pdfPtr, size);
      const buffer = new ArrayBuffer(bytes.byteLength);
      new Uint8Array(buffer).set(bytes);
      return { bytes: buffer, size };
    } finally {
      if (pdfPtr) fn.EPDF_FreeBuffer(pdfPtr);
      mem.free(sizePtr);
      mem.free(idxPtr);
      fn.FPDF_CloseDocument(destPtr);
    }
  }
}
