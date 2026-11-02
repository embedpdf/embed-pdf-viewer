import {
  EngineError,
  EngineErrorCode,
  PAGE_INSERT_BLANK_MAX_COUNT,
  type PageInsertBlankSpec,
  type PageInsertResult,
  type PagePosition,
  type PageRef,
  type PdfCoordinates,
} from '@embedpdf/engine-core/runtime';
import { NULL_PTR } from '@embedpdf/engine-runtime';
import type { PdfRuntimeModule, Ptr } from '@embedpdf/engine-runtime';

import { keepFieldNamesApart } from './internal/keepFieldNamesApart';
import { pageIndexAt } from './internal/pageIndexAt';
import { PagesReader } from './PagesReader';
import { promoteInlineAnnotations } from '../annotations/internal/write/promoteInlineAnnotations';
import {
  objectNumberUnavailable,
  type DocumentSession,
} from '../../document-session/DocumentSession';
import { loadFailure } from '../../runtime/loadError';
import { withI32Array } from '../../runtime/memory/scratch';
import { throwIfAborted } from '../../shared/abort';

/**
 * Insert pages into the session document: every page of a standalone PDF,
 * copies of the document's own pages, or blank pages. A structural mutation
 * (like move/delete): `EPDFDoc_ImportPages` deep-copies pages in at
 * `position` with the form fields of their widgets, and the page registry is
 * rebuilt. Pre-existing pages keep their identity and `RevisionToken`s; the
 * new pages get the numbers the caller gives (`objectNumbers`, numbers the
 * session holds) or fresh ones, resolved from the post-insert registry.
 */
export class PagesInserter {
  constructor(
    private readonly runtime: PdfRuntimeModule,
    private readonly session: DocumentSession,
  ) {}

  insert(
    bytes: ArrayBuffer,
    position: PagePosition,
    signal: AbortSignal,
    objectNumbers?: readonly number[],
  ): PageInsertResult<PdfCoordinates> {
    throwIfAborted(signal);
    if (bytes.byteLength === 0) {
      throw new EngineError(EngineErrorCode.InvalidArg, 'pages.insert requires non-empty bytes');
    }

    const { fn, mem } = this.runtime;
    const destPtr = this.session.requireDocPtr();
    const at = pageIndexAt(this.session, position, fn.FPDF_GetPageCount(destPtr));

    // EPDFDoc_ImportPages does not fully detach imported objects from their
    // source document (imported streams still read through it), so
    // the source doc and its buffer must outlive every future save of the
    // destination. On failure they are released immediately; on success
    // they are parked on the session and released at session close; only a
    // deep-detaching import in the runtime would let them close eagerly.
    const dataPtr = mem.alloc(bytes.byteLength);
    let srcPtr: Ptr | null = null;
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
      const count = fn.FPDF_GetPageCount(srcPtr);
      if (count <= 0) {
        throw new EngineError(EngineErrorCode.InvalidArg, 'pages.insert source PDF has no pages');
      }
      keepFieldNamesApart(this.runtime, this.session, srcPtr);
      const result = this.importInto(srcPtr, at, count, objectNumbers, 'pages.insert', signal);
      const retainedSrc = srcPtr;
      this.session.retainUntilClose(() => {
        fn.FPDF_CloseDocument(retainedSrc);
        mem.free(dataPtr);
      });
      return result;
    } catch (error) {
      if (srcPtr) fn.FPDF_CloseDocument(srcPtr);
      mem.free(dataPtr);
      throw error;
    }
  }

  /**
   * Copy the document's pages `refs`, in that order, to `position`. The pages
   * are copied out into a scratch document with the form fields of their
   * widgets, those fields' names are kept apart from the document's there, as
   * an insert's are (`keepFieldNamesApart`), and the copies are copied in.
   * The scratch document stays open until the session closes: the copies may
   * still read streams through it, as an insert's do through its source.
   */
  copy(
    refs: readonly PageRef[],
    position: PagePosition,
    signal: AbortSignal,
    objectNumbers?: readonly number[],
  ): PageInsertResult<PdfCoordinates> {
    throwIfAborted(signal);
    if (refs.length === 0) {
      throw new EngineError(EngineErrorCode.InvalidArg, 'pages.copy requires at least one page');
    }
    // NotFound for a page the document doesn't have; a page named twice is copied twice.
    const indices = this.session
      .resolvePageRefs([...refs])
      .map((pageObjectNumber) => this.session.recordByObjectNumber(pageObjectNumber).pageIndex);

    const { fn } = this.runtime;
    const destPtr = this.session.requireDocPtr();
    const at = pageIndexAt(this.session, position, fn.FPDF_GetPageCount(destPtr));

    const scratchPtr = fn.FPDF_CreateNewDocument();
    if (!scratchPtr) {
      throw new EngineError(EngineErrorCode.Unknown, 'FPDF_CreateNewDocument failed');
    }
    try {
      const copied = withI32Array(this.runtime.mem, indices, (indicesPtr, count) =>
        fn.EPDFDoc_ImportPages(scratchPtr, destPtr, indicesPtr, count, 0, NULL_PTR),
      );
      if (!copied) {
        throw new EngineError(
          EngineErrorCode.Unknown,
          `EPDFDoc_ImportPages rejected copying pages [${indices.join(',')}] out`,
        );
      }
      keepFieldNamesApart(this.runtime, this.session, scratchPtr);
      const result = this.importInto(
        scratchPtr,
        at,
        indices.length,
        objectNumbers,
        'pages.copy',
        signal,
      );
      this.session.retainUntilClose(() => fn.FPDF_CloseDocument(scratchPtr));
      return result;
    } catch (error) {
      fn.FPDF_CloseDocument(scratchPtr);
      throw error;
    }
  }

  /**
   * Copies every page of `srcPtr` (`count` of them) in at `at`, each at the
   * number `objectNumbers` gives it, and reads the pages as they are now. A
   * failure takes back what it copied: the job's layer transaction aborts.
   */
  private importInto(
    srcPtr: Ptr,
    at: number,
    count: number,
    objectNumbers: readonly number[] | undefined,
    op: 'pages.insert' | 'pages.copy',
    signal: AbortSignal,
  ): PageInsertResult<PdfCoordinates> {
    const { fn, mem } = this.runtime;
    const destPtr = this.session.requireDocPtr();
    if (objectNumbers && objectNumbers.length !== count) {
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        `${op} needs one object number per page: ${objectNumbers.length} for ${count}`,
        { details: { field: 'objectNumbers' } },
      );
    }
    for (const objectNumber of objectNumbers ?? []) this.session.claimObjectNumber(objectNumber);

    // Null index array + count 0 = "import every page", in order.
    const imported = objectNumbers
      ? withI32Array(mem, objectNumbers, (numbersPtr) =>
          fn.EPDFDoc_ImportPages(destPtr, srcPtr, NULL_PTR, 0, at, numbersPtr),
        )
      : fn.EPDFDoc_ImportPages(destPtr, srcPtr, NULL_PTR, 0, at, NULL_PTR);
    if (!imported) {
      throw new EngineError(
        EngineErrorCode.Unknown,
        `EPDFDoc_ImportPages rejected the ${op} at index ${at}`,
      );
    }

    // Page count and order changed; rebuild the index<->pon map.
    this.session.refreshPageRegistry();

    const layout = new PagesReader(this.runtime, this.session).read(signal);
    const insertedPages: PageRef[] = layout.pages.slice(at, at + count).map((page) => page.ref);
    // A copied page is born in this document, not in its file, so its inline
    // annotations are born as objects here, named by their numbers.
    for (const page of insertedPages) {
      promoteInlineAnnotations(this.runtime, this.session, page.objectNumber);
    }
    return {
      insertedPages,
      layout,
      meta: { affectedPages: [], cacheDelta: null, ...this.session.writeStamp() },
    };
  }

  /**
   * Create `count` blank pages of `size` at `position`. Same mutation
   * contract as `insert`, but native creation (`EPDFPage_InsertBlankRaw`,
   * which never loads the page) instead of a deep copy: no source document,
   * so none of the retain-until-close lifetime hazard above. A blank page has
   * no `/Contents`, which ISO 32000-2 defines as an empty page.
   *
   * `objectNumbers`, one per page, names the pages: numbers the session
   * holds, each checked before the first page is made.
   */
  insertBlank(
    spec: PageInsertBlankSpec,
    position: PagePosition,
    signal: AbortSignal,
    objectNumbers?: readonly number[],
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
    const at = pageIndexAt(this.session, position, fn.FPDF_GetPageCount(destPtr));

    if (objectNumbers && objectNumbers.length !== count) {
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        `pages.insertBlank needs one object number per page: ${objectNumbers.length} for ${count}`,
        { details: { field: 'objectNumbers' } },
      );
    }
    for (const objectNumber of objectNumbers ?? []) this.session.claimObjectNumber(objectNumber);

    // A failure takes back the pages already made: the job's layer
    // transaction aborts.
    for (let i = 0; i < count; i++) {
      const objectNumber = objectNumbers?.[i];
      // 0: the next free one.
      if (
        !fn.EPDFPage_InsertBlankRaw(destPtr, at + i, size.width, size.height, objectNumber ?? 0)
      ) {
        // The index was checked: a numbered page refused is a number another
        // object has.
        if (objectNumber !== undefined) throw objectNumberUnavailable(objectNumber, 'taken');
        throw new EngineError(
          EngineErrorCode.Unknown,
          `EPDFPage_InsertBlankRaw rejected page ${i + 1}/${count} at index ${at + i}`,
        );
      }
    }

    this.session.refreshPageRegistry();

    const layout = new PagesReader(this.runtime, this.session).read(signal);
    const insertedPages: PageRef[] = layout.pages.slice(at, at + count).map((page) => page.ref);
    return {
      insertedPages,
      layout,
      meta: { affectedPages: [], cacheDelta: null, ...this.session.writeStamp() },
    };
  }
}
