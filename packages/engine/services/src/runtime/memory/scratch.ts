import type { PdfRuntimeMemory, Ptr } from '@embedpdf/engine-runtime';

/**
 * Allocate a scratch buffer, run `body` with it, and always free it.
 *
 * Every PDFium out-parameter call follows the same shape: malloc a
 * buffer, hand its pointer to the native function, read the result back,
 * free the buffer. Hand-rolling that `try/finally` at each call site is
 * how leaks and copy-paste bugs creep in, so it lives here once.
 */
export function withScratch<T>(mem: PdfRuntimeMemory, bytes: number, body: (ptr: Ptr) => T): T {
  const ptr = mem.alloc(bytes);
  try {
    return body(ptr);
  } finally {
    mem.free(ptr);
  }
}

/**
 * Like {@link withScratch} but for native calls that take several
 * out-parameters at once (e.g. `FPDFAnnot_GetColor` with one pointer per
 * channel). Buffers are freed in reverse allocation order.
 */
export function withScratchN<T>(
  mem: PdfRuntimeMemory,
  sizes: ReadonlyArray<number>,
  body: (ptrs: Ptr[]) => T,
): T {
  const ptrs = sizes.map((size) => mem.alloc(size));
  try {
    return body(ptrs);
  } finally {
    for (let i = ptrs.length - 1; i >= 0; i--) {
      mem.free(ptrs[i]);
    }
  }
}
