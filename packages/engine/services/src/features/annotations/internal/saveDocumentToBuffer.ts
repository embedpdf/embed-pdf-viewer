import { EngineError, EngineErrorCode } from '@embedpdf/engine-core/runtime';
import type { PdfFunctions, PdfRuntimeMemory, Ptr } from '@embedpdf/engine-runtime';

import { withScratch } from '../../../runtime/memory/scratch';
import { U64_BYTES, pokeU64 } from '../../../runtime/memory/u64';

const FPDF_NO_INCREMENTAL = 1 << 1;

/** A document such as an exported drawing, fully rewritten into bytes the caller owns. */
export function saveDocumentToBuffer(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  docPtr: Ptr,
  what: string,
): { bytes: ArrayBuffer; size: number } {
  let pdfPtr: Ptr | null = null;
  try {
    return withScratch(mem, U64_BYTES, (sizePtr) => {
      // `unsigned long*`: 8 bytes on native, 4 on wasm32 — zero the whole slot.
      pokeU64(mem, sizePtr, 0);
      pdfPtr = fn.EPDF_SaveDocumentToOwnedBuffer(docPtr, FPDF_NO_INCREMENTAL, sizePtr);
      const size = Number(mem.peek(sizePtr, 'i32'));
      if (!pdfPtr || size <= 0) {
        throw new EngineError(EngineErrorCode.DocOpenFailed, `failed to save ${what}`);
      }
      const bytes = mem.readBytes(pdfPtr, size);
      const buffer = new ArrayBuffer(bytes.byteLength);
      new Uint8Array(buffer).set(bytes);
      return { bytes: buffer, size };
    });
  } finally {
    if (pdfPtr) fn.EPDF_FreeBuffer(pdfPtr);
  }
}
