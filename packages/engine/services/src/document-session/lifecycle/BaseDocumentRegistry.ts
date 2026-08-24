import { EngineError, EngineErrorCode } from '@embedpdf/engine-core/runtime';
import type { PdfFileAccessHandle, PdfRuntimeModule, Ptr } from '@embedpdf/engine-runtime';

import type { AcquiredBaseDocument } from './PdfDocumentOpener';
import { CloseStack, setRuntimeOwnerPermissionsIfEncrypted } from './PdfDocumentOpener';

interface BaseEntry {
  key: string;
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
        throw new EngineError(EngineErrorCode.DocOpenFailed, 'failed to open base document');
      }
      setRuntimeOwnerPermissionsIfEncrypted(this.runtime, basePtr);
      stack.push(() => fn.EPDF_ReleaseBaseDocument(basePtr));
      return this.insert(opts.key, basePtr, () => stack.close());
    } catch (error) {
      stack.close();
      throw error;
    }
  }

  acquireFileBase(opts: {
    key: string;
    path: string;
    password?: string | null;
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
        throw new EngineError(EngineErrorCode.DocOpenFailed, 'failed to open base document');
      }
      setRuntimeOwnerPermissionsIfEncrypted(this.runtime, basePtr);
      stack.push(() => fn.EPDF_ReleaseBaseDocument(basePtr));
      return this.insert(opts.key, basePtr, () => stack.close());
    } catch (error) {
      stack.close();
      throw error;
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

  private insert(key: string, basePtr: Ptr, close: () => void): AcquiredBaseDocument {
    const entry: BaseEntry = { key, basePtr, refs: 1, close };
    this.entries.set(key, entry);
    return this.handleFor(entry);
  }

  private handleFor(entry: BaseEntry): AcquiredBaseDocument {
    let released = false;
    return {
      key: entry.key,
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
