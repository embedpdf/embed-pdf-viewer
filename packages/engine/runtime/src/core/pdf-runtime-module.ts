import type { PdfFunctions } from './pdf-functions.generated';

export type Ptr = bigint & { readonly __brand: 'PdfRuntimePtr' };
export type Callback = bigint & { readonly __brand: 'PdfRuntimeCallback' };

/** The null pointer; useful when the underlying API accepts a NULL value. */
export const NULL_PTR = 0n as Ptr;

export type MemoryValueKind = 'i8' | 'i16' | 'i32' | 'i64' | 'f32' | 'f64' | 'ptr';

export type CallbackKind = string;
export type CallbackFn<K extends CallbackKind = CallbackKind> = (...args: unknown[]) => unknown;

export interface PdfRuntimeMemory {
  alloc(bytes: number): Ptr;
  free(ptr: Ptr): void;
  readBytes(ptr: Ptr, len: number): Uint8Array;
  writeBytes(ptr: Ptr, data: Uint8Array): void;
  readU8String(ptr: Ptr): string;
  writeU8String(str: string): Ptr;
  readU16String(ptr: Ptr): string;
  writeU16String(str: string): Ptr;
  peek(ptr: Ptr, kind: MemoryValueKind, byteOffset?: number): number | bigint;
  poke(ptr: Ptr, kind: MemoryValueKind, value: number | bigint, byteOffset?: number): void;
}

export interface PdfRuntimeCallbacks {
  register<K extends CallbackKind>(kind: K, fn: CallbackFn<K>): Callback;
  dispose(callback: Callback): void;
}

export interface PdfFileAccessHandle {
  /** Pointer to the owned FPDF_FILEACCESS struct. */
  readonly ptr: Ptr;
  /** Releases callbacks, native file handles, and retained byte views. */
  close(): void;
}

export interface PdfRuntimeFileAccess {
  /**
   * Small in-memory file access, intended for layer deltas/artifacts.
   * Browser base documents should prefer EPDF_LoadMemBaseDocument64().
   */
  fromMemory(bytes: Uint8Array | ArrayBuffer): PdfFileAccessHandle;
  /** Native/node only: range-reads a local file without loading it into JS. */
  fromNodeFile(path: string): PdfFileAccessHandle;
}

export interface PdfFileWriteHandle {
  /** Pointer to the owned FPDF_FILEWRITE struct. */
  readonly ptr: Ptr;
  /** Flushes/closes the underlying writer and releases native resources. */
  close(): void;
}

export interface PdfRuntimeFileWrite {
  /** Native/node only: writes PDFium output directly to a local file. */
  toNodeFile(path: string): PdfFileWriteHandle;
}

export interface PdfRuntimeModule {
  readonly kind: 'wasm' | 'native';
  readonly platform: string;
  readonly mem: PdfRuntimeMemory;
  readonly cb: PdfRuntimeCallbacks;
  readonly fileAccess: PdfRuntimeFileAccess;
  readonly fileWrite: PdfRuntimeFileWrite;
  readonly fn: PdfFunctions;
  destroy(): Promise<void>;
}

export interface CreatePdfRuntimeOptions {
  /**
   * Runtime preference. Native is attempted first in Node by default, with
   * WebAssembly as the fallback.
   */
  prefer?: 'auto' | 'native' | 'wasm';
  /**
   * Emscripten module overrides for the wasm runtime.
   */
  wasm?: Record<string, unknown>;
}
