import { EngineError, EngineErrorCode } from '@embedpdf/engine-core/runtime';
import type { PdfFileAccessHandle, PdfRuntimeModule, Ptr } from '@embedpdf/engine-runtime';
import { NULL_PTR } from '@embedpdf/engine-runtime';
import { withUtf8CString } from '../../runtime/memory/strings';

export type OpenedPdfDocumentKind = 'fat-memory' | 'layer';

const FPDF_ERR_PASSWORD = 4;

/**
 * Where a session's bytes come from, retained for the session's lifetime
 * so that every consumer (signing candidates, overlays, verbatim reads)
 * shares one interpretation: an immutable base in the registry (by key;
 * file bases also carry their path) and the layer the session was opened
 * with. A plain session has neither. Byte-backed layer sources keep their
 * bytes: they are what a candidate reopens over the same base.
 */
export type BaseSource =
  | { readonly kind: 'memory'; readonly key: string }
  | { readonly kind: 'file'; readonly key: string; readonly path: string };

export interface DocumentSource {
  readonly base: BaseSource | null;
  readonly layer: LayerSource | null;
  readonly password: string | null;
}

export interface OpenedPdfDocument {
  readonly kind: OpenedPdfDocumentKind;
  readonly docPtr: Ptr;
  readonly source: DocumentSource;
  close(): void;
}

export interface AcquiredBaseDocument {
  readonly key: string;
  readonly kind: 'memory' | 'file';
  /** File bases only. */
  readonly path?: string;
  readonly basePtr: Ptr;
  release(): void;
}

export type LayerSource =
  | { readonly kind: 'fresh' }
  | { readonly kind: 'raw-delta'; readonly bytes: Uint8Array | ArrayBuffer }
  | { readonly kind: 'artifact'; readonly bytes: Uint8Array | ArrayBuffer }
  | { readonly kind: 'artifact-file'; readonly path: string };

export class CloseStack {
  private readonly actions: Array<() => void> = [];
  private closed = false;

  push(action: () => void): void {
    if (this.closed) {
      action();
      return;
    }
    this.actions.push(action);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    let firstError: unknown = null;
    for (let i = this.actions.length - 1; i >= 0; i--) {
      try {
        this.actions[i]?.();
      } catch (error) {
        firstError ??= error;
      }
    }
    this.actions.length = 0;
    if (firstError) throw firstError;
  }
}

export function openFatMemoryDocument(
  runtime: PdfRuntimeModule,
  bytes: Uint8Array,
  password: string | null = null,
): OpenedPdfDocument {
  const { mem, fn } = runtime;
  const stack = new CloseStack();
  const dataPtr = mem.alloc(bytes.byteLength);
  stack.push(() => mem.free(dataPtr));

  try {
    mem.writeBytes(dataPtr, bytes);
    const docPtr = fn.FPDF_LoadMemDocument64(dataPtr, bytes.byteLength, password ?? '');
    if (!docPtr) {
      // Distinguish "locked" from "broken": a password failure is a
      // recoverable state the caller can act on (prompt + unlock), never
      // a generic open failure.
      if (fn.FPDF_GetLastError() === FPDF_ERR_PASSWORD) {
        throw password
          ? new EngineError(EngineErrorCode.DocPasswordIncorrect, 'incorrect document password')
          : new EngineError(EngineErrorCode.DocPasswordRequired, 'document requires a password');
      }
      throw new EngineError(EngineErrorCode.DocOpenFailed, 'failed to open document');
    }
    setRuntimeOwnerPermissionsIfEncrypted(runtime, docPtr);
    stack.push(() => fn.FPDF_CloseDocument(docPtr));
    return {
      kind: 'fat-memory',
      docPtr,
      source: { base: null, layer: null, password },
      close: () => stack.close(),
    };
  } catch (error) {
    stack.close();
    throw error;
  }
}

export function openLayerDocument(
  runtime: PdfRuntimeModule,
  base: AcquiredBaseDocument,
  layer: LayerSource = { kind: 'fresh' },
  password: string | null = null,
): OpenedPdfDocument {
  const { mem, fn } = runtime;
  const stack = new CloseStack();
  stack.push(() => base.release());

  let layerAccess: PdfFileAccessHandle | null = null;
  const statusPtr = mem.alloc(4);
  try {
    mem.poke(statusPtr, 'i32', -1);
    let docPtr: Ptr;
    if (layer.kind === 'fresh') {
      docPtr = fn.EPDFLayer_OpenLayer(base.basePtr, NULL_PTR, password ?? '', statusPtr);
    } else if (layer.kind === 'artifact-file' && runtime.kind === 'native') {
      // The runtime opens the file itself and the layer keeps it open: the
      // delta is read in place, never copied, and every stream it carries
      // stays a view into the file (no overlay or twin copy either).
      docPtr = withUtf8CString(mem, layer.path, (pathPtr) =>
        fn.EPDFLayer_OpenLayerArtifactFromPath(base.basePtr, pathPtr, password ?? '', statusPtr),
      );
    } else {
      layerAccess =
        layer.kind === 'artifact-file'
          ? runtime.fileAccess.fromNodeFile(layer.path)
          : runtime.fileAccess.fromMemory(layer.bytes);
      stack.push(() => layerAccess?.close());
      docPtr =
        layer.kind === 'artifact' || layer.kind === 'artifact-file'
          ? fn.EPDFLayer_OpenLayerArtifact(base.basePtr, layerAccess.ptr, password ?? '', statusPtr)
          : fn.EPDFLayer_OpenLayer(base.basePtr, layerAccess.ptr, password ?? '', statusPtr);
    }

    const status = Number(mem.peek(statusPtr, 'i32'));
    if (!docPtr || status !== 0) {
      throw layerOpenError(status);
    }

    setRuntimeOwnerPermissionsIfEncrypted(runtime, docPtr);
    stack.push(() => fn.FPDF_CloseDocument(docPtr));
    const baseSource: BaseSource =
      base.kind === 'file' && base.path !== undefined
        ? { kind: 'file', key: base.key, path: base.path }
        : { kind: 'memory', key: base.key };
    return {
      kind: 'layer',
      docPtr,
      source: { base: baseSource, layer, password },
      close: () => stack.close(),
    };
  } catch (error) {
    stack.close();
    throw error;
  } finally {
    mem.free(statusPtr);
  }
}

export function setRuntimeOwnerPermissionsIfEncrypted(
  runtime: PdfRuntimeModule,
  docPtr: Ptr,
): void {
  const { fn } = runtime;
  if (fn.EPDF_IsEncrypted && fn.EPDF_SetRuntimeOwnerPermissions && fn.EPDF_IsEncrypted(docPtr)) {
    fn.EPDF_SetRuntimeOwnerPermissions(docPtr, true);
  }
}

function layerOpenError(status: number): EngineError {
  switch (status) {
    case 1:
      return new EngineError(EngineErrorCode.DocPasswordRequired, 'layer requires a password');
    case 2:
      return new EngineError(EngineErrorCode.MalformedPdf, 'layer delta is malformed');
    case 3:
      return new EngineError(
        EngineErrorCode.MalformedPdf,
        'layer artifact does not match the supplied base document',
      );
    default:
      return new EngineError(EngineErrorCode.DocOpenFailed, 'failed to open layer document');
  }
}
