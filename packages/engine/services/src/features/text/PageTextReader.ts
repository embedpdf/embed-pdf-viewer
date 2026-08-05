import type { PageObjectNumber, PageTextSnapshot } from '@embedpdf/engine-core/runtime';
import { EngineError, EngineErrorCode } from '@embedpdf/engine-core/runtime';
import type { PdfRuntimeModule, Ptr } from '@embedpdf/engine-runtime';

import type { DocumentSession } from '../../document-session/DocumentSession';
import { withScratch } from '../../runtime/memory/scratch';
import { throwIfAborted } from '../../shared/abort';

/**
 * Per-page slow-path text reader. Acquires a `pagePtr` from the
 * `PagePtrPool`, opens a PDFium text page (`FPDFText_LoadPage`),
 * extracts the full UTF-16 buffer with `FPDFText_GetText`, decodes,
 * and releases everything in reverse order.
 *
 * Memory model:
 *   - `count` is in UTF-16 code units (FPDFText's "char").
 *   - The buffer needs `(count + 1) * 2` bytes (PDFium writes a
 *     trailing NUL terminator).
 *   - `mem.readU16String` walks the buffer up to the NUL and decodes
 *     to a JS string, faithfully preserving surrogate pairs.
 *
 * Errors:
 *   - `EPDFDoc_LoadPageByObjectNumber` returning 0 is `NotFound`
 *     (raised by `PagePtrPool.acquire`).
 *   - `FPDFText_LoadPage` returning 0 is `RuntimeUnavailable` — should
 *     not happen on a healthy page; treat it as a runtime bug rather
 *     than user error.
 */
export class PageTextReader {
  constructor(
    private readonly runtime: PdfRuntimeModule,
    private readonly session: DocumentSession,
  ) {}

  read(pageObjectNumber: PageObjectNumber, signal: AbortSignal): PageTextSnapshot {
    throwIfAborted(signal);
    const { fn, mem } = this.runtime;
    const pool = this.session.pagePool();
    const pagePtr = pool.acquire(pageObjectNumber);

    try {
      throwIfAborted(signal);
      const textPagePtr = fn.FPDFText_LoadPage(pagePtr);
      if (!textPagePtr) {
        throw new EngineError(
          EngineErrorCode.RuntimeUnavailable,
          `FPDFText_LoadPage returned null for page object ${pageObjectNumber}`,
        );
      }
      try {
        throwIfAborted(signal);
        const charCount = fn.FPDFText_CountChars(textPagePtr);
        const text = readPageText(fn, mem, textPagePtr, charCount);
        return {
          text,
          charCount: Math.max(charCount, 0),
        };
      } finally {
        fn.FPDFText_ClosePage(textPagePtr);
      }
    } finally {
      pool.release(pageObjectNumber);
    }
  }
}

function readPageText(
  fn: PdfRuntimeModule['fn'],
  mem: PdfRuntimeModule['mem'],
  textPagePtr: Ptr,
  charCount: number,
): string {
  if (charCount <= 0) return '';
  // FPDFText_GetText writes UTF-16 code units, NUL-terminated. The
  // documented sizing rule is `(count + 1) * 2` bytes for `count`
  // requested chars; PDFium writes `count + 1` UTF-16 units including
  // the terminator and returns the number of UTF-16 units it wrote
  // (terminator included).
  const bufBytes = (charCount + 1) * 2;
  return withScratch(mem, bufBytes, (buf) => {
    const written = fn.FPDFText_GetText(textPagePtr, 0, charCount, buf);
    if (written <= 0) return '';
    return mem.readU16String(buf);
  });
}
