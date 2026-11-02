import type { CodePointRange } from '@embedpdf/engine-core/runtime';
import { NULL_PTR, type PdfRuntimeModule, type Ptr } from '@embedpdf/engine-runtime';

import { withScratch } from './scratch';

/**
 * Read a native getter that writes `(first, count)` pairs of `uint32_t` and
 * returns how many there are: probed with `(NULL, 0)`, then filled.
 */
export function readRanges(
  runtime: PdfRuntimeModule,
  call: (out: Ptr, capacity: number) => number,
): CodePointRange[] {
  const { mem } = runtime;
  const count = call(NULL_PTR, 0);
  if (count <= 0) return [];
  return withScratch(mem, count * 8, (out) => {
    call(out, count);
    return Array.from({ length: count }, (_, at) => ({
      start: Number(mem.peek(out, 'i32', at * 8)) >>> 0,
      count: Number(mem.peek(out, 'i32', at * 8 + 4)) >>> 0,
    }));
  });
}
