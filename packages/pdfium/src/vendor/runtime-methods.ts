/* AUTO-GENERATED — DO NOT EDIT BY HAND */
/// <reference types="emscripten" />

export interface WasmExports {
  malloc: (size: number) => number;
  free:   (ptr:  number) => void;
}

/**
 * Subset of Emscripten helpers that our wrapper re-exports.
 * Extend `customTsTypes` above if you want richer typings.
 */
export interface PdfiumRuntimeMethods {
  wasmExports: WasmExports;
  UTF16ToString: typeof UTF16ToString;
  UTF8ToString: typeof UTF8ToString;
  addFunction: typeof addFunction;
  ccall: typeof ccall;
  cwrap: typeof cwrap;
  getValue: typeof getValue;
  removeFunction: typeof removeFunction;
  setValue: typeof setValue;
  stringToUTF16: typeof stringToUTF16;
  stringToUTF8: typeof stringToUTF8;
}

export const exportedRuntimeMethods = [
  "wasmExports",
  "UTF16ToString",
  "UTF8ToString",
  "addFunction",
  "ccall",
  "cwrap",
  "getValue",
  "removeFunction",
  "setValue",
  "stringToUTF16",
  "stringToUTF8"
] as const;
