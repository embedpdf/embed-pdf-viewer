import { pdfFunctionSignatures } from '../core/pdf-functions.generated';
import type {
  PdfFunctionAbiSlot,
  PdfFunctionSignature,
  PdfFunctions,
} from '../core/pdf-functions.generated';
import type {
  Callback,
  CallbackFn,
  CallbackKind,
  CreatePdfRuntimeOptions,
  MemoryValueKind,
  PdfRuntimeCallbacks,
  PdfRuntimeFileAccess,
  PdfRuntimeFileWrite,
  PdfRuntimeMemory,
  PdfRuntimeModule,
  Ptr,
} from '../core/pdf-runtime-module';

type EmscriptenModule = Record<string, any> & {
  HEAPU8: Uint8Array;
  _malloc?: (bytes: number) => number;
  _free?: (ptr: number) => void;
  cwrap?: (
    name: string,
    result: string | null,
    params: readonly string[],
  ) => (...args: unknown[]) => unknown;
  addFunction?: (fn: (...args: unknown[]) => unknown, signature?: string) => number;
  removeFunction?: (ptr: number) => void;
  getValue?: (ptr: number, type: string) => number;
  setValue?: (ptr: number, value: number | bigint, type: string) => void;
  UTF8ToString?: (ptr: number) => string;
  UTF16ToString?: (ptr: number) => string;
  stringToUTF8?: (str: string, ptr: number, maxBytes: number) => void;
  stringToUTF16?: (str: string, ptr: number, maxBytes: number) => void;
};

function toPtr(value: number | bigint): Ptr {
  return BigInt(value) as Ptr;
}

function toNumber(ptr: Ptr | Callback): number {
  return Number(ptr);
}

function wasmValueKind(kind: MemoryValueKind): string {
  switch (kind) {
    case 'i8':
      return 'i8';
    case 'i16':
      return 'i16';
    case 'i32':
      return 'i32';
    case 'i64':
      return 'i64';
    case 'f32':
      return 'float';
    case 'f64':
      return 'double';
    case 'ptr':
      return '*';
  }
}

function createWasmMemory(module: EmscriptenModule): PdfRuntimeMemory {
  const malloc = module._malloc ?? module.wasmExports?.malloc;
  const free = module._free ?? module.wasmExports?.free;

  if (!malloc || !free) {
    throw new Error('WASM runtime does not expose malloc/free');
  }

  return {
    alloc(bytes) {
      return toPtr(malloc(bytes));
    },
    free(ptr) {
      free(toNumber(ptr));
    },
    readBytes(ptr, len) {
      return module.HEAPU8.slice(toNumber(ptr), toNumber(ptr) + len);
    },
    writeBytes(ptr, data) {
      module.HEAPU8.set(data, toNumber(ptr));
    },
    readU8String(ptr) {
      return module.UTF8ToString?.(toNumber(ptr)) ?? '';
    },
    writeU8String(str) {
      const bytes = new TextEncoder().encode(`${str}\0`);
      const ptr = toPtr(malloc(bytes.length));
      module.HEAPU8.set(bytes, toNumber(ptr));
      return ptr;
    },
    readU16String(ptr) {
      return module.UTF16ToString?.(toNumber(ptr)) ?? '';
    },
    writeU16String(str) {
      const bytes = (str.length + 1) * 2;
      const ptr = toPtr(malloc(bytes));
      module.stringToUTF16?.(str, toNumber(ptr), bytes);
      return ptr;
    },
    peek(ptr, kind, byteOffset = 0) {
      return module.getValue?.(toNumber(ptr) + byteOffset, wasmValueKind(kind)) ?? 0;
    },
    poke(ptr, kind, value, byteOffset = 0) {
      module.setValue?.(toNumber(ptr) + byteOffset, value, wasmValueKind(kind));
    },
  };
}

function createWasmCallbacks(module: EmscriptenModule): PdfRuntimeCallbacks {
  return {
    register(kind: CallbackKind, fn: CallbackFn): Callback {
      if (!module.addFunction) throw new Error('WASM runtime does not expose addFunction');
      return BigInt(module.addFunction(fn, kind)) as Callback;
    },
    dispose(callback) {
      module.removeFunction?.(toNumber(callback));
    },
  };
}

function createWasmFileAccess(
  mem: PdfRuntimeMemory,
  callbacks: PdfRuntimeCallbacks,
): PdfRuntimeFileAccess {
  return {
    fromMemory(input) {
      const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
      if (bytes.byteLength > 0xffffffff) {
        throw new RangeError('FPDF_FILEACCESS on wasm supports files up to 4 GiB');
      }

      const structPtr = mem.alloc(12);
      let callback: Callback | null = null;
      let closed = false;

      try {
        callback = callbacks.register('iiiii', (_param, position, outPtr, size) => {
          const begin = Number(position);
          const length = Number(size);
          if (
            !Number.isSafeInteger(begin) ||
            !Number.isSafeInteger(length) ||
            begin < 0 ||
            length < 0 ||
            begin + length > bytes.byteLength
          ) {
            return 0;
          }
          mem.writeBytes(toPtr(outPtr as number), bytes.subarray(begin, begin + length));
          return 1;
        });

        mem.poke(structPtr, 'i32', bytes.byteLength, 0);
        mem.poke(structPtr, 'i32', toNumber(callback), 4);
        mem.poke(structPtr, 'i32', 0, 8);

        return {
          ptr: structPtr,
          close() {
            if (closed) return;
            closed = true;
            callbacks.dispose(callback as Callback);
            mem.free(structPtr);
          },
        };
      } catch (error) {
        if (callback) callbacks.dispose(callback);
        mem.free(structPtr);
        throw error;
      }
    },
    fromNodeFile() {
      throw new Error('fromNodeFile() is only available on the native Node runtime');
    },
  };
}

function createWasmFileWrite(): PdfRuntimeFileWrite {
  return {
    toNodeFile() {
      throw new Error('toNodeFile() is only available on the native Node runtime');
    },
  };
}

/**
 * Translate a JS argument to whatever the wasm32 ABI expects for this slot.
 *
 * The codegen tells the truth on each target now (size_t = i32 on wasm), so
 * the only translation left is `Ptr` (TS bigint) → numeric address for cwrap.
 */
function fromJsArg(meta: PdfFunctionAbiSlot | undefined, value: unknown): unknown {
  if (!meta) return value;
  if (meta.ts === 'Ptr' && typeof value === 'bigint') return Number(value);
  return value;
}

function toJsResult(meta: PdfFunctionAbiSlot | null, value: unknown): unknown {
  if (!meta) return undefined;
  if (meta.ts === 'Ptr' && typeof value === 'number') return toPtr(value);
  if (meta.ts === 'bigint' && typeof value === 'number') return BigInt(value);
  return value;
}

/**
 * The wasm artifact is built WITHOUT `WASM_BIGINT`, so Emscripten
 * legalizes every `i64` parameter at the JS boundary into an (i32 low,
 * i32 high) pair — the export wrapper takes one extra argument per i64
 * and rejects BigInt values outright. Expand each declared i64 argument
 * into its legalized pair before calling.
 */
function expandI64Args(signature: PdfFunctionSignature, args: unknown[]): unknown[] {
  const expanded: unknown[] = [];
  signature.params.forEach((p, i) => {
    if (p.wasm.kind === 'i64') {
      const v = BigInt((args[i] ?? 0) as number | bigint);
      expanded.push(Number(v & 0xffffffffn), Number((v >> 32n) & 0xffffffffn));
    } else {
      expanded.push(args[i]);
    }
  });
  return expanded;
}

function createWasmFunctions(module: EmscriptenModule): PdfFunctions {
  const out: Record<string, (...args: unknown[]) => unknown> = {};
  for (const [name, signature] of Object.entries(pdfFunctionSignatures)) {
    const hasI64Params = signature.params.some((p) => p.wasm.kind === 'i64');
    const bridge =
      (call: (...args: unknown[]) => unknown) =>
      (...args: unknown[]) => {
        const mapped = args.map((arg, i) => fromJsArg(signature.params[i], arg));
        return toJsResult(
          signature.result,
          call(...(hasI64Params ? expandI64Args(signature, mapped) : mapped)),
        );
      };

    if (module.cwrap) {
      // `null` only appears for void return; params never carry it.
      // i64 params are legalized (see expandI64Args): two i32 slots each.
      const paramTypes = signature.params.flatMap((p) =>
        p.wasm.kind === 'i64' ? ['number', 'number'] : [p.wasm.cwrap as string],
      );
      out[name] = bridge(
        module.cwrap(name, signature.result ? signature.result.wasm.cwrap : null, paramTypes),
      );
    } else if (typeof module[`_${name}`] === 'function') {
      out[name] = bridge(module[`_${name}`].bind(module));
    }
  }
  return out as unknown as PdfFunctions;
}

export async function createWasmRuntime(
  opts: CreatePdfRuntimeOptions = {},
): Promise<PdfRuntimeModule> {
  const wasmPackage = await import('@embedpdf/pdf-runtime-wasm32');
  const createModule = (wasmPackage.default ?? wasmPackage) as (
    opts?: Record<string, unknown>,
  ) => Promise<EmscriptenModule>;
  const module = await createModule(opts.wasm);
  const mem = createWasmMemory(module);
  const cb = createWasmCallbacks(module);

  return {
    kind: 'wasm',
    platform: 'wasm32',
    mem,
    cb,
    fileAccess: createWasmFileAccess(mem, cb),
    fileWrite: createWasmFileWrite(),
    fn: createWasmFunctions(module),
    async destroy() {
      module._free = module._free;
    },
  };
}
