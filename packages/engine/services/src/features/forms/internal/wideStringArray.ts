import type { PdfRuntimeModule, Ptr } from '@embedpdf/engine-runtime';

import { withPointerTable } from '../../../runtime/memory/pointers';

/**
 * Marshal a `const FPDF_WIDESTRING*` array: encode every string into the
 * runtime heap, write the pointer table, run |body|, free everything.
 */
export function withWideStringArray<T>(
  runtime: PdfRuntimeModule,
  values: readonly string[],
  body: (arrayPtr: Ptr, count: number) => T,
): T {
  const { mem } = runtime;
  const stringPtrs = values.map((value) => mem.writeU16String(value));
  try {
    return withPointerTable(runtime, stringPtrs, body);
  } finally {
    for (let i = stringPtrs.length - 1; i >= 0; i--) {
      mem.free(stringPtrs[i]);
    }
  }
}
