import {
  EngineError,
  EngineErrorCode,
  PAGE_INSERT_BLANK_MAX_COUNT,
  type PageInsertBlankSpec,
  type PageInsertResult,
  type PageObjectNumber,
} from '@embedpdf/engine-core/runtime';
import { NULL_PTR } from '@embedpdf/engine-runtime';
import type { PdfRuntimeModule, Ptr } from '@embedpdf/engine-runtime';

import { PagesReader } from './PagesReader';
import type { DocumentSession } from '../../document-session/DocumentSession';
import { throwIfAborted } from '../../shared/abort';

/**
 * Insert every page of a standalone PDF into the session document. A
 * structural MUTATION (like move/delete): the source bytes are loaded as a
 * throwaway PDFium document, `FPDF_ImportPagesByIndex` deep-copies its
 * pages in at `destIndex`, and the page registry is rebuilt. Pre-existing
 * pages keep their identity and `RevisionToken`s; the inserted copies get
 * fresh object numbers, resolved from the post-insert registry.
 */
export class PagesInserter {
  constructor(
    private readonly runtime: PdfRuntimeModule,
    private readonly session: DocumentSession,
  ) {}

  insert(bytes: ArrayBuffer, destIndex: number | undefined, signal: AbortSignal): PageInsertResult {
    throwIfAborted(signal);
    if (bytes.byteLength === 0) {
      throw new EngineError(EngineErrorCode.InvalidArg, 'pages.insert requires non-empty bytes');
    }

    const { fn, mem } = this.runtime;
    const destPtr = this.session.requireDocPtr();
    const beforeCount = fn.FPDF_GetPageCount(destPtr);
    const at = destIndex ?? beforeCount;
    if (!Number.isInteger(at) || at < 0 || at > beforeCount) {
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        `pages.insert destIndex ${at} out of range [0, ${beforeCount}]`,
      );
    }

    // FPDF_ImportPagesByIndex does NOT fully detach imported objects from
    // their source document (imported streams still read through it), so
    // the source doc and its buffer must outlive every future save of the
    // destination. On failure they are released immediately; on success
    // they are parked on the session and released at session close.
    // TODO(fork): a deep-detaching import would let this close eagerly.
    const dataPtr = mem.alloc(bytes.byteLength);
    let srcPtr: Ptr | null = null;
    let insertedCount = 0;
    try {
      mem.writeBytes(dataPtr, new Uint8Array(bytes));
      srcPtr = fn.FPDF_LoadMemDocument(dataPtr, bytes.byteLength, '');
      if (!srcPtr) {
        throw new EngineError(
          EngineErrorCode.MalformedPdf,
          'pages.insert source PDF could not be opened',
        );
      }
      insertedCount = fn.FPDF_GetPageCount(srcPtr);
      if (insertedCount <= 0) {
        throw new EngineError(EngineErrorCode.InvalidArg, 'pages.insert source PDF has no pages');
      }
      // Null index array + count 0 = "import every page", in order.
      if (!fn.FPDF_ImportPagesByIndex(destPtr, srcPtr, NULL_PTR, 0, at)) {
        throw new EngineError(
          EngineErrorCode.Unknown,
          `FPDF_ImportPagesByIndex rejected the insert at index ${at}`,
        );
      }
      const retainedSrc = srcPtr;
      this.session.retainUntilClose(() => {
        fn.FPDF_CloseDocument(retainedSrc);
        mem.free(dataPtr);
      });
    } catch (error) {
      if (srcPtr) fn.FPDF_CloseDocument(srcPtr);
      mem.free(dataPtr);
      throw error;
    }

    // Page count and order changed; rebuild the index<->pon map. Existing
    // pages' revisions and weak-flag bookkeeping stay put (keyed by pon).
    this.session.refreshPageRegistry();

    const layout = new PagesReader(this.runtime, this.session).read(signal);
    const insertedPageObjectNumbers: PageObjectNumber[] = layout.pages
      .slice(at, at + insertedCount)
      .map((page) => page.pageObjectNumber);
    return { insertedPageObjectNumbers, layout, cache: null };
  }

  /**
   * Create `count` blank pages of `size` at `destIndex`. Same mutation
   * contract as `insert`, but native creation (`FPDFPage_New`) instead of a
   * deep copy: no source document, so none of the retain-until-close
   * lifetime hazard above. Each page gets an empty content stream
   * (`FPDFPage_GenerateContent`) so the saved PDF renders identically in
   * third-party viewers.
   */
  insertBlank(
    spec: PageInsertBlankSpec,
    destIndex: number | undefined,
    signal: AbortSignal,
  ): PageInsertResult {
    throwIfAborted(signal);
    const { size } = spec;
    const count = spec.count ?? 1;
    if (
      !Number.isFinite(size?.width) ||
      !Number.isFinite(size?.height) ||
      size.width <= 0 ||
      size.height <= 0
    ) {
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        `pages.insertBlank size must have positive finite dimensions, got ${size?.width}x${size?.height}`,
      );
    }
    if (!Number.isInteger(count) || count < 1 || count > PAGE_INSERT_BLANK_MAX_COUNT) {
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        `pages.insertBlank count ${count} out of range [1, ${PAGE_INSERT_BLANK_MAX_COUNT}]`,
      );
    }

    const { fn } = this.runtime;
    const destPtr = this.session.requireDocPtr();
    const beforeCount = fn.FPDF_GetPageCount(destPtr);
    const at = destIndex ?? beforeCount;
    if (!Number.isInteger(at) || at < 0 || at > beforeCount) {
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        `pages.insertBlank destIndex ${at} out of range [0, ${beforeCount}]`,
      );
    }

    for (let i = 0; i < count; i++) {
      // FPDFPage_New would clamp an out-of-range index to "append"; the
      // guard above keeps that PDFium leniency out of the contract.
      const pagePtr = fn.FPDFPage_New(destPtr, at + i, size.width, size.height);
      if (!pagePtr) {
        // Undo the pages already created so a failure leaves the document
        // untouched (the registry was never refreshed, so it still agrees).
        for (let j = 0; j < i; j++) fn.FPDFPage_Delete(destPtr, at);
        throw new EngineError(
          EngineErrorCode.Unknown,
          `FPDFPage_New rejected page ${i + 1}/${count} at index ${at + i}`,
        );
      }
      fn.FPDFPage_GenerateContent(pagePtr);
      fn.FPDF_ClosePage(pagePtr);
    }

    this.session.refreshPageRegistry();

    const layout = new PagesReader(this.runtime, this.session).read(signal);
    const insertedPageObjectNumbers: PageObjectNumber[] = layout.pages
      .slice(at, at + count)
      .map((page) => page.pageObjectNumber);
    return { insertedPageObjectNumbers, layout, cache: null };
  }
}
