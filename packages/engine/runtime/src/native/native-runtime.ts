import { createRequire } from 'node:module';
import type {
  Callback,
  CallbackFn,
  CallbackKind,
  MemoryValueKind,
  PdfRuntimeCallbacks,
  PdfRuntimeFileAccess,
  PdfRuntimeFileWrite,
  PdfRuntimeMemory,
  PdfRuntimeModule,
  Ptr,
} from '../core/pdf-runtime-module';
import type { RuntimeTarget } from '../core/platform';
import { packageNameForTarget } from '../core/platform';
import { pdfFunctionSignatures } from '../core/pdf-functions.generated';
import type { PdfFunctions } from '../core/pdf-functions.generated';

type NativeAddon = Record<string, any> & {
  alloc(bytes: number): bigint;
  free(ptr: bigint): void;
  readBytes(ptr: bigint, len: number): ArrayBuffer;
  writeBytes(ptr: bigint, bytes: ArrayBuffer): void;
  readU8String(ptr: bigint): string;
  writeU8String(str: string): bigint;
  readU16String(ptr: bigint): string;
  writeU16String(str: string): bigint;
  peek(ptr: bigint, kind: string): number | bigint;
  poke(ptr: bigint, kind: string, value: number | bigint): void;
  registerCallback?(kind: string, fn: (...args: unknown[]) => unknown): bigint;
  disposeCallback?(ptr: bigint): void;
  createMemoryFileAccess?(bytes: ArrayBuffer): bigint;
  createPathFileAccess?(path: string): bigint;
  getFileAccessPtr?(handle: bigint): bigint;
  destroyFileAccess?(handle: bigint): void;
  createPathFileWrite?(path: string): bigint;
  getFileWritePtr?(handle: bigint): bigint;
  destroyFileWrite?(handle: bigint): void;
};

const require = createRequire(import.meta.url);

function createNativeMemory(addon: NativeAddon): PdfRuntimeMemory {
  return {
    alloc: (bytes) => addon.alloc(bytes) as Ptr,
    free: (ptr) => addon.free(ptr),
    readBytes: (ptr, len) => new Uint8Array(addon.readBytes(ptr, len)),
    writeBytes: (ptr, data) => {
      const copy = new ArrayBuffer(data.byteLength);
      new Uint8Array(copy).set(data);
      addon.writeBytes(ptr, copy);
    },
    readU8String: (ptr) => addon.readU8String(ptr),
    writeU8String: (str) => addon.writeU8String(str) as Ptr,
    readU16String: (ptr) => addon.readU16String(ptr),
    writeU16String: (str) => addon.writeU16String(str) as Ptr,
    peek: (ptr, kind: MemoryValueKind, byteOffset = 0) =>
      addon.peek(byteOffset === 0 ? ptr : (((ptr as bigint) + BigInt(byteOffset)) as Ptr), kind),
    poke: (ptr, kind: MemoryValueKind, value, byteOffset = 0) =>
      addon.poke(
        byteOffset === 0 ? ptr : (((ptr as bigint) + BigInt(byteOffset)) as Ptr),
        kind,
        value,
      ),
  };
}

function createNativeCallbacks(addon: NativeAddon): PdfRuntimeCallbacks {
  return {
    register(kind: CallbackKind, fn: CallbackFn): Callback {
      if (!addon.registerCallback) throw new Error('Native runtime does not expose callbacks');
      return addon.registerCallback(kind, fn) as Callback;
    },
    dispose(callback) {
      addon.disposeCallback?.(callback);
    },
  };
}

function toOwnedArrayBuffer(input: Uint8Array | ArrayBuffer): ArrayBuffer {
  if (input instanceof ArrayBuffer) return input;
  const copy = new ArrayBuffer(input.byteLength);
  new Uint8Array(copy).set(input);
  return copy;
}

function createNativeFileAccess(addon: NativeAddon): PdfRuntimeFileAccess {
  const createHandle = (handle: bigint) => {
    if (!addon.getFileAccessPtr || !addon.destroyFileAccess) {
      throw new Error('Native runtime does not expose file-access helpers');
    }

    let closed = false;
    return {
      ptr: addon.getFileAccessPtr(handle) as Ptr,
      close() {
        if (closed) return;
        closed = true;
        addon.destroyFileAccess?.(handle);
      },
    };
  };

  return {
    fromMemory(bytes) {
      if (!addon.createMemoryFileAccess) {
        throw new Error('Native runtime does not expose memory file-access helpers');
      }
      return createHandle(addon.createMemoryFileAccess(toOwnedArrayBuffer(bytes)));
    },
    fromNodeFile(path) {
      if (!addon.createPathFileAccess) {
        throw new Error('Native runtime does not expose node file-access helpers');
      }
      return createHandle(addon.createPathFileAccess(path));
    },
  };
}

function createNativeFileWrite(addon: NativeAddon): PdfRuntimeFileWrite {
  return {
    toNodeFile(path) {
      if (!addon.createPathFileWrite || !addon.getFileWritePtr || !addon.destroyFileWrite) {
        throw new Error('Native runtime does not expose file-write helpers');
      }

      const handle = addon.createPathFileWrite(path);
      let closed = false;
      return {
        ptr: addon.getFileWritePtr(handle) as Ptr,
        close() {
          if (closed) return;
          closed = true;
          addon.destroyFileWrite?.(handle);
        },
      };
    },
  };
}

function createNativeFunctions(addon: NativeAddon): PdfFunctions {
  const out: Record<string, (...args: unknown[]) => unknown> = {};
  for (const name of Object.keys(pdfFunctionSignatures)) {
    if (typeof addon[name] === 'function') out[name] = addon[name].bind(addon);
  }
  return out as unknown as PdfFunctions;
}

export async function createNativeRuntime(target: RuntimeTarget): Promise<PdfRuntimeModule> {
  const packageName = packageNameForTarget(target);
  const addon = require(packageName) as NativeAddon;

  return {
    kind: 'native',
    platform: target,
    mem: createNativeMemory(addon),
    cb: createNativeCallbacks(addon),
    fileAccess: createNativeFileAccess(addon),
    fileWrite: createNativeFileWrite(addon),
    fn: createNativeFunctions(addon),
    async destroy() {
      if (typeof addon.destroy === 'function') addon.destroy();
    },
  };
}
