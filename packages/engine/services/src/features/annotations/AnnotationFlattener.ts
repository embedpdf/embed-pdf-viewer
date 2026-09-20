import type {
  AnnotationFlattenResult,
  AnnotationRef,
  MutationMeta,
  PageFlattenUsage,
  PageObjectNumber,
} from '@embedpdf/engine-core/runtime';
import { EngineError, EngineErrorCode } from '@embedpdf/engine-core/runtime';
import type { PdfRuntimeModule, Ptr } from '@embedpdf/engine-runtime';

import { AnnotationReader } from './AnnotationReader';
import { resolveAnnotPtr } from './internal/identity/resolveAnnotationPointer';
import type { DocumentSession } from '../../document-session/DocumentSession';
import { withScratch } from '../../runtime/memory/scratch';
import { throwIfAborted } from '../../shared/abort';

// `FLATTEN_*` / `EPDF_FLATTEN_STATUS_*` from public/fpdf_flatten.h.
const FLATTEN_FAIL = 0;
const FLATTEN_SUCCESS = 1;
const FLATTEN_NOTHING_TO_DO = 2;
const STATUS_APPLIED = 0;
const STATUS_SKIPPED = 1;
const STATUS_NOT_ON_PAGE = 2;
const FPDF_NO_INCREMENTAL = 1 << 1;

/**
 * The annotation-plane flatten verbs — `pages.flatten` for a chosen set:
 * in place (`flatten`) or into a new single-page document
 * (`exportAppearance`). Both resolve refs to native handles on the page,
 * hand the SET to the fork (one candidate plan, one placement writer — the
 * same code whole-page flatten runs), and release every handle afterwards.
 */
export class AnnotationFlattener {
  constructor(
    private readonly runtime: PdfRuntimeModule,
    private readonly session: DocumentSession,
  ) {}

  flatten(
    pageObjectNumber: PageObjectNumber,
    refs: AnnotationRef[],
    usage: PageFlattenUsage,
    signal: AbortSignal,
  ): AnnotationFlattenResult {
    throwIfAborted(signal);
    this.requireRefs('annotations.flatten', pageObjectNumber, refs);
    const { fn, mem } = this.runtime;
    const pool = this.session.pagePool();
    const pagePtr = pool.acquire(pageObjectNumber);
    try {
      const annotPtrs = this.resolveAll(pagePtr, refs);
      let code: number;
      let statuses: number[];
      try {
        [code, statuses] = this.withHandleArray(annotPtrs, (arrayPtr) =>
          withScratch(mem, 4 * refs.length, (statusPtr) => {
            const rc = fn.EPDFPage_FlattenAnnotations(
              pagePtr,
              arrayPtr,
              refs.length,
              usage === 'print' ? 1 : 0,
              statusPtr,
            );
            const out: number[] = [];
            for (let i = 0; i < refs.length; i++) {
              out.push(Number(mem.peek(statusPtr, 'i32', 4 * i)));
            }
            return [rc, out] as const;
          }),
        );
      } finally {
        for (const annotPtr of annotPtrs) fn.FPDFPage_CloseAnnot(annotPtr);
      }

      if (code === FLATTEN_FAIL) {
        // Every ref resolved on THIS page (resolveAll), so a FAIL is the
        // fork disagreeing with /Annots or a catalog write failing.
        const foreign = statuses.findIndex((status) => status === STATUS_NOT_ON_PAGE);
        throw new EngineError(
          foreign >= 0 ? EngineErrorCode.InvalidArg : EngineErrorCode.Unknown,
          foreign >= 0
            ? `annotations.flatten: ref ${foreign} is not an annotation of page ${pageObjectNumber}`
            : 'native annotation flatten failed after preflight',
        );
      }

      const results = refs.map((ref, i) => ({
        ref,
        status: statuses[i] === STATUS_APPLIED ? ('applied' as const) : ('skipped' as const),
      }));
      if (code === FLATTEN_NOTHING_TO_DO || code !== FLATTEN_SUCCESS) {
        return { pageObjectNumber, usage, results, meta: null };
      }

      // Content + annotation liveness changed on this page — the same
      // bookkeeping PagesFlattener performs per affected page.
      this.session.noteMutation();
      this.session.bumpRevision(pageObjectNumber);
      try {
        new AnnotationReader(this.runtime, this.session).list(pageObjectNumber, signal);
      } catch {
        // Weak-annotation state stays conservatively unknown; never lose
        // the layer artifact over a post-flatten diagnostic read.
      }
      const meta: MutationMeta = {
        affectedPages: [this.session.pageState(pageObjectNumber)],
        cacheDelta: null,
      };
      return { pageObjectNumber, usage, results, meta };
    } finally {
      pool.release(pageObjectNumber);
    }
  }

  exportAppearance(
    pageObjectNumber: PageObjectNumber,
    refs: AnnotationRef[],
    signal: AbortSignal,
  ): { bytes: ArrayBuffer; size: number } {
    throwIfAborted(signal);
    this.requireRefs('annotations.exportAppearance', pageObjectNumber, refs);
    const { fn, mem } = this.runtime;
    const pool = this.session.pagePool();
    const pagePtr = pool.acquire(pageObjectNumber);
    let exportedPtr: Ptr | null = null;
    let pdfPtr: Ptr | null = null;
    try {
      const annotPtrs = this.resolveAll(pagePtr, refs);
      try {
        exportedPtr = this.withHandleArray(annotPtrs, (arrayPtr) =>
          fn.EPDFPage_ExportAnnotationsAsDocument(pagePtr, arrayPtr, refs.length),
        );
      } finally {
        for (const annotPtr of annotPtrs) fn.FPDFPage_CloseAnnot(annotPtr);
      }
      if (!exportedPtr) {
        // All-or-nothing by contract: a ref without a usable normal
        // appearance (hidden, popup, no /AP) refuses the whole export.
        throw new EngineError(
          EngineErrorCode.InvalidArg,
          'annotations.exportAppearance: every ref must be a visible annotation of this page with a normal appearance',
        );
      }
      return withScratch(mem, 4, (sizePtr) => {
        mem.poke(sizePtr, 'i32', 0);
        pdfPtr = fn.EPDF_SaveDocumentToOwnedBuffer(exportedPtr!, FPDF_NO_INCREMENTAL, sizePtr);
        const size = Number(mem.peek(sizePtr, 'i32'));
        if (!pdfPtr || size <= 0) {
          throw new EngineError(
            EngineErrorCode.DocOpenFailed,
            'failed to save exported appearances',
          );
        }
        const bytes = mem.readBytes(pdfPtr, size);
        const buffer = new ArrayBuffer(bytes.byteLength);
        new Uint8Array(buffer).set(bytes);
        return { bytes: buffer, size };
      });
    } finally {
      if (pdfPtr) fn.EPDF_FreeBuffer(pdfPtr);
      if (exportedPtr) fn.FPDF_CloseDocument(exportedPtr);
      pool.release(pageObjectNumber);
    }
  }

  /** Resolve every ref on `pagePtr` (NotFound / InvalidReference from the
   *  resolver on caller error); on any failure, close what was opened. */
  private resolveAll(pagePtr: Ptr, refs: AnnotationRef[]): Ptr[] {
    const { fn } = this.runtime;
    const annotPtrs: Ptr[] = [];
    try {
      for (const ref of refs) {
        annotPtrs.push(resolveAnnotPtr(this.runtime, this.session, pagePtr, ref));
      }
      return annotPtrs;
    } catch (error) {
      for (const annotPtr of annotPtrs) fn.FPDFPage_CloseAnnot(annotPtr);
      throw error;
    }
  }

  /** Marshal an `FPDF_ANNOTATION*` array for the call's duration. */
  private withHandleArray<T>(annotPtrs: Ptr[], body: (arrayPtr: Ptr) => T): T {
    const { mem } = this.runtime;
    const isWasm = this.runtime.kind === 'wasm';
    const ptrSize = isWasm ? 4 : 8;
    return withScratch(mem, Math.max(1, annotPtrs.length * ptrSize), (arrayPtr) => {
      annotPtrs.forEach((ptr, i) =>
        isWasm
          ? mem.poke(arrayPtr, 'i32', Number(ptr), i * 4)
          : mem.poke(arrayPtr, 'i64', ptr, i * 8),
      );
      return body(arrayPtr);
    });
  }

  private requireRefs(op: string, pageObjectNumber: PageObjectNumber, refs: AnnotationRef[]): void {
    if (refs.length === 0) {
      throw new EngineError(EngineErrorCode.InvalidArg, `${op} requires at least one ref`);
    }
    for (const ref of refs) {
      if (ref.pageObjectNumber !== pageObjectNumber) {
        throw new EngineError(
          EngineErrorCode.InvalidArg,
          `${op} refs must all target page ${pageObjectNumber}; got ref on page ${ref.pageObjectNumber}`,
        );
      }
    }
  }
}
