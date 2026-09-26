import type { PdfRuntimeMemory, Ptr } from '@embedpdf/engine-runtime';

/**
 * 64-bit out-params as two little-endian 32-bit halves: the wasm memory
 * helpers have no 64-bit accessors (Emscripten's `setValue(i64)` needs
 * WASM_BIGINT), and the native runtime reads the same layout.
 */
export function pokeU64(mem: PdfRuntimeMemory, ptr: Ptr, value: number, byteOffset = 0): void {
  const big = BigInt(value);
  mem.poke(ptr, 'i32', Number(big & 0xffffffffn) | 0, byteOffset);
  mem.poke(ptr, 'i32', Number((big >> 32n) & 0xffffffffn) | 0, byteOffset + 4);
}

export function peekU64(mem: PdfRuntimeMemory, ptr: Ptr, byteOffset = 0): number {
  const lo = Number(mem.peek(ptr, 'i32', byteOffset)) >>> 0;
  const hi = Number(mem.peek(ptr, 'i32', byteOffset + 4)) >>> 0;
  return hi * 0x100000000 + lo;
}

export const U64_BYTES = 8;
