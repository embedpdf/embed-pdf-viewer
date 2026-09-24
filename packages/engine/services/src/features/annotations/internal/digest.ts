import { EngineError, EngineErrorCode } from '@embedpdf/engine-core/runtime';
import type { PdfFunctions, PdfRuntimeMemory, Ptr } from '@embedpdf/engine-runtime';

import { withScratchN } from '../../../runtime/memory/scratch';

/** `EPDF_DIGEST_SHA256` from `public/epdf_digest.h`. */
const EPDF_DIGEST_SHA256 = 1;
/** Room for an `unsigned long` out-parameter: 8 bytes on 64-bit native. */
const ULONG_SLOT = 8;

/** SHA-256 (hex) of `size` bytes at `dataPtr`. */
export function sha256Hex(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  dataPtr: Ptr,
  size: number,
): string {
  return withScratchN(mem, [32, ULONG_SLOT], ([outPtr, lenPtr]) => {
    mem.poke(lenPtr, 'i32', 32, 0);
    mem.poke(lenPtr, 'i32', 0, 4);
    if (!fn.EPDF_DigestBuffer(dataPtr, size, EPDF_DIGEST_SHA256, outPtr, lenPtr)) {
      throw new EngineError(EngineErrorCode.Unknown, 'EPDF_DigestBuffer returned false');
    }
    let hex = '';
    for (const byte of mem.readBytes(outPtr, 32)) hex += byte.toString(16).padStart(2, '0');
    return hex;
  });
}

/** SHA-256 (hex) of bytes held outside the runtime's memory. */
export function sha256HexOf(fn: PdfFunctions, mem: PdfRuntimeMemory, bytes: Uint8Array): string {
  const dataPtr = mem.alloc(Math.max(1, bytes.byteLength));
  try {
    mem.writeBytes(dataPtr, bytes);
    return sha256Hex(fn, mem, dataPtr, bytes.byteLength);
  } finally {
    mem.free(dataPtr);
  }
}
