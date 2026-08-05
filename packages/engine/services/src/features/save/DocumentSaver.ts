import { EngineError, EngineErrorCode, type PdfSaveMode } from '@embedpdf/engine-core/runtime';
import type { PdfRuntimeModule, Ptr } from '@embedpdf/engine-runtime';

import { layerSaveError, pdfSaveModeFlags } from './internal/pdfSaveMode';
import type { DocumentSession } from '../../document-session/DocumentSession';

/**
 * Owns every "serialize the open document" path for a `DocumentSession`.
 * Two distinct outputs:
 *
 *   - Layer artifacts (`saveLayerArtifact*`) are the storage-optimized
 *     `.layer` delta used by server-side persistence. Only valid for a
 *     `layer` session.
 *   - Standalone saves (`saveStandalone*`) export a self-contained PDF
 *     view (base + applied delta) via `FPDF_SaveAsCopy` /
 *     `EPDF_SaveDocumentToOwnedBuffer`, valid for any session kind.
 *
 * Lives in `engine-services` so the browser Worker and the Node
 * `worker_thread` server share the exact same save code path.
 */
export class DocumentSaver {
  constructor(
    private readonly runtime: PdfRuntimeModule,
    private readonly session: DocumentSession,
  ) {}

  saveLayerArtifact(): { bytes: ArrayBuffer; size: number } {
    this.requireLayer();

    const { mem, fn } = this.runtime;
    const sizePtr = mem.alloc(4);
    const statusPtr = mem.alloc(4);
    let artifactPtr: Ptr | null = null;
    try {
      mem.poke(sizePtr, 'i32', 0);
      mem.poke(statusPtr, 'i32', -1);
      artifactPtr = fn.EPDFLayer_SaveLayerArtifactToOwnedBuffer(
        this.session.requireDocPtr(),
        sizePtr,
        statusPtr,
      );
      const status = Number(mem.peek(statusPtr, 'i32'));
      const size = Number(mem.peek(sizePtr, 'i32'));
      if (!artifactPtr || status !== 0 || size <= 0) {
        throw layerSaveError(status);
      }

      const bytes = mem.readBytes(artifactPtr, size);
      const buffer = new ArrayBuffer(bytes.byteLength);
      new Uint8Array(buffer).set(bytes);
      return { bytes: buffer, size };
    } finally {
      if (artifactPtr) fn.EPDF_FreeBuffer(artifactPtr);
      mem.free(statusPtr);
      mem.free(sizePtr);
    }
  }

  saveLayerArtifactToFile(path: string): { path: string } {
    this.requireLayer();

    const { mem, fn } = this.runtime;
    const statusPtr = mem.alloc(4);
    const writer = this.runtime.fileWrite.toNodeFile(path);
    try {
      mem.poke(statusPtr, 'i32', -1);
      const ok = fn.EPDFLayer_SaveLayerArtifact(
        this.session.requireDocPtr(),
        writer.ptr,
        statusPtr,
      );
      const status = Number(mem.peek(statusPtr, 'i32'));
      if (!ok || status !== 0) {
        throw layerSaveError(status);
      }
      return { path };
    } finally {
      writer.close();
      mem.free(statusPtr);
    }
  }

  saveStandaloneToBuffer(mode: PdfSaveMode): { bytes: ArrayBuffer; size: number } {
    const { mem, fn } = this.runtime;
    const sizePtr = mem.alloc(4);
    let pdfPtr: Ptr | null = null;
    try {
      mem.poke(sizePtr, 'i32', 0);
      // Standalone saves are not layer artifacts. For a CPDF_LayerDocument,
      // FPDF_INCREMENTAL copies the base bytes through and appends the layer
      // delta as a normal PDF revision. The EPDFLayer_* artifact APIs are only
      // for internal server storage.
      pdfPtr = fn.EPDF_SaveDocumentToOwnedBuffer(
        this.session.requireDocPtr(),
        pdfSaveModeFlags(mode),
        sizePtr,
      );
      const size = Number(mem.peek(sizePtr, 'i32'));
      if (!pdfPtr || size <= 0) {
        throw new EngineError(EngineErrorCode.DocOpenFailed, 'failed to save document');
      }

      const bytes = mem.readBytes(pdfPtr, size);
      const buffer = new ArrayBuffer(bytes.byteLength);
      new Uint8Array(buffer).set(bytes);
      return { bytes: buffer, size };
    } finally {
      if (pdfPtr) fn.EPDF_FreeBuffer(pdfPtr);
      mem.free(sizePtr);
    }
  }

  saveStandaloneToFile(path: string, mode: PdfSaveMode): { path: string } {
    const writer = this.runtime.fileWrite.toNodeFile(path);
    try {
      // See saveStandaloneToBuffer(): this exports a standalone PDF view,
      // not the storage-optimized `.layer` artifact.
      const ok = this.runtime.fn.FPDF_SaveAsCopy(
        this.session.requireDocPtr(),
        writer.ptr,
        pdfSaveModeFlags(mode),
      );
      if (!ok) {
        throw new EngineError(EngineErrorCode.DocOpenFailed, 'failed to save document');
      }
      return { path };
    } finally {
      writer.close();
    }
  }

  private requireLayer(): void {
    if (this.session.kind !== 'layer') {
      throw new EngineError(EngineErrorCode.InvalidArg, 'document session is not a layer');
    }
  }
}
