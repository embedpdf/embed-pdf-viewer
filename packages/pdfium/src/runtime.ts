/// <reference types="emscripten" />

export interface WasmExports {
  malloc: (size: number) => number;
  free: (ptr: number) => void;
}

export interface PdfiumRuntimeMethods {
  wasmExports: WasmExports;
  cwrap: typeof cwrap;
  addFunction: typeof addFunction;
  removeFunction: typeof removeFunction;
  ccall: typeof ccall;
  setValue: typeof setValue;
  getValue: typeof getValue;
  UTF8ToString: typeof UTF8ToString;
  UTF16ToString: typeof UTF16ToString;
  stringToUTF8: typeof stringToUTF8;
  stringToUTF16: typeof stringToUTF16;
}
