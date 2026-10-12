import type { PdfRuntimeModule, Ptr } from '@embedpdf/engine-runtime';

import { withScratch } from './scratch';

/** A runtime's pointer width: 4 bytes in wasm32, 8 natively. */
export function pointerBytes(runtime: PdfRuntimeModule): 4 | 8 {
  return runtime.kind === 'wasm' ? 4 : 8;
}

/**
 * Write the pointer `value` at `offset` past `base`, at the runtime's
 * pointer width (a bigint pointer can't be poked into the wasm32 heap).
 */
export function pokePointer(runtime: PdfRuntimeModule, base: Ptr, offset: number, value: Ptr): void {
  if (runtime.kind === 'wasm') {
    runtime.mem.poke(base, 'i32', Number(value), offset);
  } else {
    runtime.mem.poke(base, 'i64', BigInt(value), offset);
  }
}

/** A `T*` table of `pointers` in runtime memory, for the duration of `body`. */
export function withPointerTable<T>(
  runtime: PdfRuntimeModule,
  pointers: readonly Ptr[],
  body: (table: Ptr, count: number) => T,
): T {
  const width = pointerBytes(runtime);
  return withScratch(runtime.mem, Math.max(1, pointers.length * width), (table) => {
    pointers.forEach((pointer, at) => pokePointer(runtime, table, at * width, pointer));
    return body(table, pointers.length);
  });
}
