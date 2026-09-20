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
  /** Returns an independent copy that remains valid after the allocation is freed. */
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
  /** Native/node only: the bytes `[offset, offset + length)` of a local file (short at EOF). */
  readRange(path: string, offset: number, length: number): Uint8Array;
  /** Native/node only: byte length of a local file. */
  sizeOf(path: string): number;
}

export interface PdfFileWriteHandle {
  /** Pointer to the owned FPDF_FILEWRITE struct. */
  readonly ptr: Ptr;
  /** Flushes/closes the underlying writer and releases native resources. */
  close(): void;
}

/**
 * Local-file operations the engine services need beyond PDFium's own
 * writers: patching a few bytes in place (sealing a signing candidate),
 * appending (streaming a verbatim copy), and removing a discarded file.
 * Node-only; the wasm runtime throws, exactly as `toNodeFile` does. Kept
 * here so the shared services never import a node module themselves.
 */
export interface PdfRuntimeFileWrite {
  /** Native/node only: writes PDFium output directly to a local file. */
  toNodeFile(path: string): PdfFileWriteHandle;
  /** Native/node only: overwrite `bytes` at `offset` in place (the file must already extend past it). */
  writeRange(path: string, offset: number, bytes: Uint8Array): void;
  /** Native/node only: append `bytes` to a local file, creating it when absent. */
  appendBytes(path: string, bytes: Uint8Array): void;
  /** Native/node only: delete a local file; a missing file is not an error. */
  removeFile(path: string): void;
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
   * Exact URL of `embedpdf.wasm`. When set, the wasm runtime fetches the binary
   * from here instead of resolving it relative to the Emscripten glue
   * (`import.meta.url`). Must be an absolute URL when the runtime boots inside
   * a `blob:` worker, where relative resolution is meaningless.
   */
  wasmUrl?: string;
  /**
   * The `embedpdf.wasm` bytes, pre-fetched by the caller. Takes precedence over
   * `wasmUrl`; no network request is made (the air-gapped path).
   */
  wasmBinary?: ArrayBuffer | Uint8Array;
  /**
   * Emscripten module overrides for the wasm runtime (escape hatch). An
   * explicit `locateFile` / `wasmBinary` here wins over the first-class
   * options above.
   */
  wasm?: Record<string, unknown>;
}
