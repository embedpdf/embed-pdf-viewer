import type { Callback, PdfRuntimeModule, Ptr } from '../core/pdf-runtime-module';

export type LegacyType = null | 'number' | 'string' | 'boolean';

export type LegacyWrappedPdfiumModule = {
  pdfium: {
    HEAPU8: {
      subarray(begin: number, end?: number): Uint8Array;
      slice(begin: number, end?: number): Uint8Array;
    };
    cwrap: (
      name: string,
      result: LegacyType,
      params: readonly LegacyType[],
    ) => (...args: any[]) => any;
    getValue: (ptr: number, type: string) => number | bigint;
    setValue: (ptr: number, value: number | bigint, type: string) => void;
    UTF8ToString: (ptr: number) => string;
    UTF16ToString: (ptr: number) => string;
    stringToUTF8: (str: string, ptr: number, maxBytes: number) => void;
    stringToUTF16: (str: string, ptr: number, maxBytes: number) => void;
    addFunction: (fn: (...args: unknown[]) => unknown, signature?: string) => number;
    removeFunction: (ptr: number) => void;
    wasmExports: {
      malloc: (bytes: number) => number;
      free: (ptr: number) => void;
    };
  };
  [name: string]: unknown;
};

function asPtr(value: number | bigint): Ptr {
  return BigInt(value) as Ptr;
}

function toNumber(value: bigint): number {
  return Number(value);
}

function legacyKind(type: string) {
  switch (type) {
    case 'i8':
      return 'i8';
    case 'i16':
      return 'i16';
    case 'i64':
      return 'i64';
    case 'float':
      return 'f32';
    case 'double':
      return 'f64';
    case '*':
      return 'ptr';
    default:
      return 'i32';
  }
}

export function toWrappedPdfiumModule(runtime: PdfRuntimeModule): LegacyWrappedPdfiumModule {
  const callbacks = new Map<number, Callback>();

  const heap = {
    subarray(begin: number, end?: number) {
      const finalEnd = end ?? begin;
      return runtime.mem.readBytes(asPtr(begin), Math.max(0, finalEnd - begin));
    },
    slice(begin: number, end?: number) {
      return this.subarray(begin, end);
    },
  };

  const wrapped: LegacyWrappedPdfiumModule = {
    pdfium: {
      HEAPU8: heap,
      cwrap(name) {
        const fn = runtime.fn[name as keyof typeof runtime.fn] as unknown;
        if (typeof fn !== 'function') throw new Error(`PDF runtime function not found: ${name}`);
        return (...args: any[]) => fn(...args);
      },
      getValue(ptr, type) {
        return runtime.mem.peek(asPtr(ptr), legacyKind(type));
      },
      setValue(ptr, value, type) {
        runtime.mem.poke(asPtr(ptr), legacyKind(type), value);
      },
      UTF8ToString(ptr) {
        return runtime.mem.readU8String(asPtr(ptr));
      },
      UTF16ToString(ptr) {
        return runtime.mem.readU16String(asPtr(ptr));
      },
      stringToUTF8(str, ptr, maxBytes) {
        const encoded = new TextEncoder().encode(str);
        runtime.mem.writeBytes(asPtr(ptr), encoded.slice(0, Math.max(0, maxBytes - 1)));
        runtime.mem.poke(asPtr(ptr + Math.min(encoded.length, Math.max(0, maxBytes - 1))), 'i8', 0);
      },
      stringToUTF16(str, ptr, maxBytes) {
        const view = new DataView(new ArrayBuffer(maxBytes));
        const maxChars = Math.max(0, Math.floor(maxBytes / 2) - 1);
        for (let i = 0; i < Math.min(str.length, maxChars); i += 1) {
          view.setUint16(i * 2, str.charCodeAt(i), true);
        }
        runtime.mem.writeBytes(asPtr(ptr), new Uint8Array(view.buffer));
      },
      addFunction(fn, signature = '') {
        const callback = runtime.cb.register(signature, fn);
        const key = toNumber(callback);
        callbacks.set(key, callback);
        return key;
      },
      removeFunction(ptr) {
        const callback = callbacks.get(ptr);
        if (callback) {
          runtime.cb.dispose(callback);
          callbacks.delete(ptr);
        }
      },
      wasmExports: {
        malloc(bytes) {
          return toNumber(runtime.mem.alloc(bytes));
        },
        free(ptr) {
          runtime.mem.free(asPtr(ptr));
        },
      },
    },
  };

  for (const key of Object.keys(runtime.fn)) {
    wrapped[key] = (runtime.fn as unknown as Record<string, unknown>)[key];
  }

  return wrapped;
}

export { toWrappedPdfiumModule as toLegacyWrappedModule };
