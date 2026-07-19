import type { PdfRuntimeModule, Ptr } from '@embedpdf/engine-runtime';

import { withScratch } from '../../../runtime/memory/scratch';

/**
 * Marshal a `const FPDF_WIDESTRING*` array: encode every string into the
 * runtime heap, write the pointer table with the runtime's pointer width
 * (bigint pointers cannot be poked into the wasm 32-bit heap), run |body|,
 * free everything.
 */
export function withWideStringArray<T>(
  runtime: PdfRuntimeModule,
  values: readonly string[],
  body: (arrayPtr: Ptr, count: number) => T,
): T {
  const { mem } = runtime;
  const stringPtrs = values.map((value) => mem.writeU16String(value));
  const isWasm = runtime.kind === 'wasm';
  const ptrSize = isWasm ? 4 : 8;
  try {
    return withScratch(mem, Math.max(1, stringPtrs.length * ptrSize), (arrayPtr) => {
      stringPtrs.forEach((ptr, i) =>
        isWasm
          ? mem.poke(arrayPtr, 'i32', Number(ptr), i * 4)
          : mem.poke(arrayPtr, 'i64', ptr, i * 8),
      );
      return body(arrayPtr, stringPtrs.length);
    });
  } finally {
    for (let i = stringPtrs.length - 1; i >= 0; i--) {
      mem.free(stringPtrs[i]);
    }
  }
}
