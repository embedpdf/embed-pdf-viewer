import {
  EngineError,
  EngineErrorCode,
  PAGE_INSERT_BLANK_MAX_COUNT,
  type PageInsertBlankSpec,
  type PageInsertResult,
  type PageRef,
  type PdfCoordinates,
} from '@embedpdf/engine-core/runtime';
import { NULL_PTR } from '@embedpdf/engine-runtime';
import type { PdfRuntimeModule, Ptr } from '@embedpdf/engine-runtime';

import { PagesReader } from './PagesReader';
import { promoteInlineAnnotations } from '../annotations/internal/write/promoteInlineAnnotations';
import type { DocumentSession } from '../../document-session/DocumentSession';
import { loadFailure } from '../../runtime/loadError';
import { throwIfAborted } from '../../shared/abort';

/**
 * Insert every page of a standalone PDF into the session document. A
 * structural mutation (like move/delete): the source bytes are loaded as a
 * throwaway PDFium document, `FPDF_ImportPagesByIndex` deep-copies its
 * pages in at `toIndex`, and the page registry is rebuilt. Pre-existing
 * pages keep their identity and `RevisionToken`s; the inserted copies get
 * fresh object numbers, resolved from the post-insert registry.
 */
export class PagesInserter {
  constructor(
    private readonly runtime: PdfRuntimeModule,
    private readonly session: DocumentSession,
  ) {}

  insert(
    bytes: ArrayBuffer,
    toIndex: number | undefined,
    signal: AbortSignal,
  ): PageInsertResult<PdfCoordinates> {
    throwIfAborted(signal);
    if (bytes.byteLength === 0) {
      throw new EngineError(EngineErrorCode.InvalidArg, 'pages.insert requires non-empty bytes');
    }

    const { fn, mem } = this.runtime;
    const destPtr = this.session.requireDocPtr();
    const beforeCount = fn.FPDF_GetPageCount(destPtr);
    const at = toIndex ?? beforeCount;
    if (!Number.isInteger(at) || at < 0 || at > beforeCount) {
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        `pages.insert toIndex ${at} out of range [0, ${beforeCount}]`,
      );
    }

    // FPDF_ImportPagesByIndex does not fully detach imported objects from
    // their source document (imported streams still read through it), so
    // the source doc and its buffer must outlive every future save of the
    // destination. On failure they are released immediately; on success
    // they are parked on the session and released at session close; only a
    // deep-detaching import in the runtime would let them close eagerly.
    const dataPtr = mem.alloc(bytes.byteLength);
    let srcPtr: Ptr | null = null;
    let insertedCount = 0;
    try {
      mem.writeBytes(dataPtr, new Uint8Array(bytes));
      srcPtr = fn.FPDF_LoadMemDocument(dataPtr, bytes.byteLength, '');
      if (!srcPtr) {
        // A password-protected source is `DocPasswordRequired`, not a
        // broken file.
        throw loadFailure(
          fn,
          null,
          new EngineError(
            EngineErrorCode.MalformedPdf,
            'pages.insert source PDF could not be opened',
          ),
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

    // Page count and order changed; rebuild the index<->pon map.
    this.session.refreshPageRegistry();

    const layout = new PagesReader(this.runtime, this.session).read(signal);
    const insertedPages: PageRef[] = layout.pages
      .slice(at, at + insertedCount)
      .map((page) => page.ref);
    // An inserted page is born in this document, not in its file, so its
    // inline annotations are born as objects here, named by their numbers.
    for (const page of insertedPages) {
      promoteInlineAnnotations(this.runtime, this.session, page.objectNumber);
    }
    return { insertedPages, layout, meta: { affectedPages: [], cacheDelta: null } };
  }

  /**
   * Create `count` blank pages of `size` at `toIndex`. Same mutation
   * contract as `insert`, but native creation (`EPDFPage_InsertBlankRaw`,
   * which never loads the page) instead of a deep copy: no source document,
   * so none of the retain-until-close lifetime hazard above. A blank page has
   * no `/Contents`, which ISO 32000-2 defines as an empty page.
   */
  insertBlank(
    spec: PageInsertBlankSpec,
    toIndex: number | undefined,
    signal: AbortSignal,
  ): PageInsertResult<PdfCoordinates> {
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
    const at = toIndex ?? beforeCount;
    if (!Number.isInteger(at) || at < 0 || at > beforeCount) {
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        `pages.insertBlank toIndex ${at} out of range [0, ${beforeCount}]`,
      );
    }

    for (let i = 0; i < count; i++) {
      // Object number 0: the next free one.
      if (!fn.EPDFPage_InsertBlankRaw(destPtr, at + i, size.width, size.height, 0)) {
        // Undo the pages already created so a failure leaves the document
        // untouched (the registry was never refreshed, so it still agrees).
        // A layer's transaction would take them back too; a fat-memory
        // document has none.
        for (let j = 0; j < i; j++) fn.FPDFPage_Delete(destPtr, at);
        throw new EngineError(
          EngineErrorCode.Unknown,
          `EPDFPage_InsertBlankRaw rejected page ${i + 1}/${count} at index ${at + i}`,
        );
      }
    }

    this.session.refreshPageRegistry();

    const layout = new PagesReader(this.runtime, this.session).read(signal);
    const insertedPages: PageRef[] = layout.pages.slice(at, at + count).map((page) => page.ref);
    return { insertedPages, layout, meta: { affectedPages: [], cacheDelta: null } };
  }
}
