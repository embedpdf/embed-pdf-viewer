import { EngineError, EngineErrorCode } from '@embedpdf/engine-core/runtime';
import type { PdfFileAccessHandle, PdfRuntimeModule, Ptr } from '@embedpdf/engine-runtime';

import type { AcquiredBaseDocument } from './PdfDocumentOpener';
import { CloseStack, setRuntimeOwnerPermissionsIfEncrypted } from './PdfDocumentOpener';

const FPDF_ERR_PASSWORD = 4;

/**
 * A password failure is a recoverable state the caller can act on (prompt,
 * unlock), never a generic open failure — the same distinction
 * `openFatMemoryDocument` draws, so a plain-bytes open that becomes a base
 * parks and unlocks exactly like it always did.
 */
function baseOpenError(runtime: PdfRuntimeModule, password: string | null | undefined): EngineError {
  if (runtime.fn.FPDF_GetLastError() === FPDF_ERR_PASSWORD) {
    return password
      ? new EngineError(EngineErrorCode.DocPasswordIncorrect, 'incorrect document password')
      : new EngineError(EngineErrorCode.DocPasswordRequired, 'document requires a password');
  }
  return new EngineError(EngineErrorCode.DocOpenFailed, 'failed to open base document');
}

interface BaseEntry {
  key: string;
  kind: 'memory' | 'file';
  path?: string;
  basePtr: Ptr;
  refs: number;
  close: () => void;
}

export class BaseDocumentRegistry {
  private readonly entries = new Map<string, BaseEntry>();

  constructor(private readonly runtime: PdfRuntimeModule) {}

  acquireMemoryBase(opts: {
    key: string;
    bytes: Uint8Array;
    password?: string | null;
    /** A verified SHA-256 (hex) of `bytes`; spares the runtime a full hashing pass. */
    knownSha256?: string;
  }): AcquiredBaseDocument {
    const existing = this.retain(opts.key);
    if (existing) return existing;

    const { mem, fn } = this.runtime;
    const stack = new CloseStack();
    const dataPtr = mem.alloc(opts.bytes.byteLength);
    stack.push(() => mem.free(dataPtr));

    try {
      mem.writeBytes(dataPtr, opts.bytes);
      const basePtr = fn.EPDF_LoadMemBaseDocument64(
        dataPtr,
        opts.bytes.byteLength,
        opts.password ?? '',
      );
      if (!basePtr) {
        throw baseOpenError(this.runtime, opts.password);
      }
      setRuntimeOwnerPermissionsIfEncrypted(this.runtime, basePtr);
      stack.push(() => fn.EPDF_ReleaseBaseDocument(basePtr));
      this.supplyKnownSha(basePtr, opts.knownSha256);
      return this.insert({ key: opts.key, kind: 'memory', basePtr, refs: 1, close: () => stack.close() });
    } catch (error) {
      stack.close();
      throw error;
    }
  }

  acquireFileBase(opts: {
    key: string;
    path: string;
    password?: string | null;
    /** A verified SHA-256 (hex) of the file; spares the runtime a full hashing pass. */
    knownSha256?: string;
  }): AcquiredBaseDocument {
    const existing = this.retain(opts.key);
    if (existing) return existing;

    const { fn } = this.runtime;
    const stack = new CloseStack();
    let access: PdfFileAccessHandle | null = null;

    try {
      access = this.runtime.fileAccess.fromNodeFile(opts.path);
      stack.push(() => access?.close());
      const basePtr = fn.EPDF_LoadBaseDocument(access.ptr, opts.password ?? '');
      if (!basePtr) {
        throw baseOpenError(this.runtime, opts.password);
      }
      setRuntimeOwnerPermissionsIfEncrypted(this.runtime, basePtr);
      stack.push(() => fn.EPDF_ReleaseBaseDocument(basePtr));
      this.supplyKnownSha(basePtr, opts.knownSha256);
      return this.insert({ key: opts.key, kind: 'file', path: opts.path, basePtr, refs: 1, close: () => stack.close() });
    } catch (error) {
      stack.close();
      throw error;
    }
  }

  /**
   * One more retain on a base already in the registry (a session holds one
   * for its lifetime, so its key is live while it is open), or null. The
   * way a signing candidate reopens over its session's own base without
   * copying a byte.
   */
  retainByKey(key: string): AcquiredBaseDocument | null {
    return this.retain(key);
  }

  /**
   * Hand the runtime a hash the host already verified for these exact
   * bytes, so it never hashes them itself. Malformed values are ignored:
   * the runtime then hashes lazily on first use, which is always correct.
   */
  private supplyKnownSha(basePtr: Ptr, sha256Hex: string | undefined): void {
    if (!sha256Hex || !/^[0-9a-fA-F]{64}$/.test(sha256Hex)) return;
    const { mem, fn } = this.runtime;
    const bytes = new Uint8Array(32);
    for (let i = 0; i < 32; i++) bytes[i] = parseInt(sha256Hex.slice(i * 2, i * 2 + 2), 16);
    const ptr = mem.alloc(32);
    try {
      mem.writeBytes(ptr, bytes);
      fn.EPDF_SetBaseDocumentSha256(basePtr, ptr);
    } finally {
      mem.free(ptr);
    }
  }

  releaseAll(): void {
    const entries = Array.from(this.entries.values());
    this.entries.clear();
    let firstError: unknown = null;
    for (const entry of entries) {
      try {
        entry.close();
      } catch (error) {
        firstError ??= error;
      }
    }
    if (firstError) throw firstError;
  }

  /** @internal Test-only probe of the per-key share refcount. */
  getRefCountForTesting(key: string): number {
    return this.entries.get(key)?.refs ?? 0;
  }

  private retain(key: string): AcquiredBaseDocument | null {
    const entry = this.entries.get(key);
    if (!entry) return null;
    entry.refs++;
    return this.handleFor(entry);
  }

  private insert(entry: BaseEntry): AcquiredBaseDocument {
    this.entries.set(entry.key, entry);
    return this.handleFor(entry);
  }

  private handleFor(entry: BaseEntry): AcquiredBaseDocument {
    let released = false;
    return {
      key: entry.key,
      kind: entry.kind,
      ...(entry.path !== undefined ? { path: entry.path } : {}),
      basePtr: entry.basePtr,
      release: () => {
        if (released) return;
        released = true;
        const live = this.entries.get(entry.key);
        if (!live) return;
        live.refs--;
        if (live.refs > 0) return;
        this.entries.delete(entry.key);
        live.close();
      },
    };
  }
}
