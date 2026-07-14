import {
  EngineError,
  EngineErrorCode,
  type PageInsertResult,
  type PageObjectNumber,
} from '@embedpdf/engine-core/runtime';
import { NULL_PTR } from '@embedpdf/pdf-runtime';
import type { PdfRuntimeModule, Ptr } from '@embedpdf/pdf-runtime';

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
}
