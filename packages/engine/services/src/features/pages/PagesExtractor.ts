import {
  EngineError,
  EngineErrorCode,
  type PageExtractFlatten,
  type PageObjectNumber,
  type PageRef,
} from '@embedpdf/engine-core/runtime';
import type { PdfRuntimeModule, Ptr } from '@embedpdf/engine-runtime';

import type { DocumentSession } from '../../document-session/DocumentSession';
import { U64_BYTES, pokeU64 } from '../../runtime/memory/u64';
import { throwIfAborted } from '../../shared/abort';
import { readMetaText } from '../metadata/internal/readMetadataText';
import { writeMetaText } from '../metadata/internal/write/writeMetaText';

const FPDF_NO_INCREMENTAL = 1 << 1;
// public/fpdf_flatten.h, public/epdf_flatten.h
const FLAT_NORMALDISPLAY = 0;
const FLAT_PRINT = 1;
const EXPORT_FLATTENED_ANNOTATIONS = 0x1;
const EXPORT_FLATTENED_FORM_FIELDS = 0x2;

/**
 * Export a subset of pages as a standalone PDF. A read over the session:
 * the pages are copied into a scratch document, so the source is untouched —
 * no registry refresh, no layer artifact. A plain copy is
 * `FPDF_ImportPagesByIndex`; a flattened one `EPDFDoc_ExportPagesFlattened`,
 * which copies the pages as they draw. Either keeps the document's title.
 * Lives next to `PagesReader`/`PagesMutator` (one file per page verb family)
 * so both worker hosts share the code path.
 */
export class PagesExtractor {
  constructor(
    private readonly runtime: PdfRuntimeModule,
    private readonly session: DocumentSession,
  ) {}

  /**
   * Copy the given pages, in the supplied caller order, into a new
   * document and serialize it: as they are, or, with `flatten`, as they draw
   * (checked against the caller's rights before it gets here). Validation up
   * front: non-empty, no duplicates, every page object number resolvable
   * (`NotFound` from the session on a bad one). The scratch document is
   * always closed, success or throw.
   */
  extract(
    pages: PageRef[],
    flatten: PageExtractFlatten | undefined,
    signal: AbortSignal,
  ): { bytes: ArrayBuffer; size: number } {
    throwIfAborted(signal);
    if (pages.length === 0) {
      throw new EngineError(EngineErrorCode.InvalidArg, 'pages.extract requires at least one page');
    }
    const pageObjectNumbers = this.session.resolvePageRefs(pages);
    const seen = new Set<PageObjectNumber>();
    for (const pageObjectNumber of pageObjectNumbers) {
      if (seen.has(pageObjectNumber)) {
        throw new EngineError(
          EngineErrorCode.InvalidArg,
          `pages.extract was given duplicate page object number ${pageObjectNumber}`,
        );
      }
      seen.add(pageObjectNumber);
    }

    // Resolve every pon to its current index via the session registry —
    // NotFound on caller error, and caller order is preserved in the output.
    const indices = pageObjectNumbers.map(
      (pageObjectNumber) => this.session.recordByObjectNumber(pageObjectNumber).pageIndex,
    );

    const { fn, mem } = this.runtime;
    const srcPtr = this.session.requireDocPtr();

    const idxPtr = mem.alloc(4 * indices.length);
    for (let i = 0; i < indices.length; i++) {
      mem.poke(idxPtr, 'i32', indices[i], 4 * i);
    }
    let destPtr: Ptr;
    try {
      destPtr = flatten
        ? this.copyFlattened(srcPtr, idxPtr, indices, flatten)
        : this.copyPlain(srcPtr, idxPtr, indices);
    } catch (error) {
      mem.free(idxPtr);
      throw error;
    }
    const sizePtr = mem.alloc(U64_BYTES);
    let pdfPtr: Ptr | null = null;
    try {
      const title = readMetaText(fn, mem, srcPtr, 'Title');
      if (title !== null) writeMetaText(fn, mem, destPtr, 'Title', title);

      // `unsigned long*`: 8 bytes on native, 4 on wasm32 — zero the whole slot.
      pokeU64(mem, sizePtr, 0);
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

  /** A new document with copies of the pages at `indices`, as they are. */
  private copyPlain(srcPtr: Ptr, idxPtr: Ptr, indices: readonly number[]): Ptr {
    const { fn } = this.runtime;
    const destPtr = fn.FPDF_CreateNewDocument();
    if (!destPtr) {
      throw new EngineError(EngineErrorCode.Unknown, 'FPDF_CreateNewDocument failed');
    }
    if (!fn.FPDF_ImportPagesByIndex(destPtr, srcPtr, idxPtr, indices.length, 0)) {
      fn.FPDF_CloseDocument(destPtr);
      throw new EngineError(
        EngineErrorCode.Unknown,
        `FPDF_ImportPagesByIndex rejected the request (indices=[${indices.join(',')}])`,
      );
    }
    return destPtr;
  }

  /**
   * A new document with the pages at `indices` as they draw for
   * `flatten.usage`: what `flatten` includes painted in, nothing interactive
   * left, layers in their state for the usage.
   */
  private copyFlattened(
    srcPtr: Ptr,
    idxPtr: Ptr,
    indices: readonly number[],
    flatten: PageExtractFlatten,
  ): Ptr {
    const flags =
      (flatten.includeAnnotations ? EXPORT_FLATTENED_ANNOTATIONS : 0) |
      (flatten.includeFormFields ? EXPORT_FLATTENED_FORM_FIELDS : 0);
    const destPtr = this.runtime.fn.EPDFDoc_ExportPagesFlattened(
      srcPtr,
      idxPtr,
      indices.length,
      flatten.usage === 'print' ? FLAT_PRINT : FLAT_NORMALDISPLAY,
      flags,
    );
    if (!destPtr) {
      throw new EngineError(
        EngineErrorCode.Unknown,
        `EPDFDoc_ExportPagesFlattened rejected the request (indices=[${indices.join(',')}])`,
      );
    }
    return destPtr;
  }
}
