import { EngineError, EngineErrorCode, type PdfSaveMode } from '@embedpdf/engine-core/runtime';
import type { PdfRuntimeModule, Ptr } from '@embedpdf/engine-runtime';

import { layerSaveError, pdfSaveModeFlags } from './internal/pdfSaveMode';
import { readSavedBuffer } from './internal/readSavedBuffer';
import type { DocumentSession } from '../../document-session/DocumentSession';
import { SignatureReader } from '../signature/SignatureReader';

/** Whose bytes a snapshot holds: the loaded file, or the file a save would write. */
export type SaveSource = 'loaded' | 'working-copy';

/** The fork's `EPDFSaveStatus`. */
const EPDF_SAVE_WRITTEN = 1;
const EPDF_SAVE_UNCHANGED_SINCE_LOAD = 2;

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

  /**
   * The bytes a save would produce, and whether they are the loaded bytes.
   * Three answers, cheapest first: nothing was mutated since load (the
   * session's counter); something was mutated but the document is still
   * the one it was opened with — the fork's save pass found no reachable
   * object that differs from its loaded version, an annotation added and
   * removed again being the common case; or a real delta. The one pass
   * answers the second and produces the third, comparing only the objects
   * that were touched. A signed file must come back exactly as sealed, so
   * the loaded bytes are returned verbatim in the first two cases.
   */
  snapshot(): { bytes: ArrayBuffer; source: SaveSource } {
    if (!this.session.hasUnsavedEdits()) {
      return { bytes: this.loadedBytes(), source: 'loaded' };
    }
    const saved = this.saveStandaloneToBufferEx('incremental');
    if (saved.unchangedSinceLoad) {
      return { bytes: this.loadedBytes(), source: 'loaded' };
    }
    return { bytes: saved.bytes, source: 'working-copy' };
  }

  /** The complete loaded bytes: a plain file, or a layer's base plus the delta it was opened with. */
  loadedBytes(): ArrayBuffer {
    return new SignatureReader(this.runtime, this.session).loadedBytes();
  }

  /**
   * The loaded bytes streamed to `path` in chunks: a plain file, or a
   * layer's base plus the delta it was opened with, never the base alone.
   * Native only. Replaces whatever `path` held.
   */
  copyLoadedBytesToFile(path: string): void {
    const reader = new SignatureReader(this.runtime, this.session);
    const size = Number(this.runtime.fn.EPDFDoc_GetLoadedBytesSize(this.session.requireDocPtr()));
    const chunk = 4 * 1024 * 1024;
    this.runtime.fileWrite.removeFile(path);
    for (let offset = 0; offset < size; offset += chunk) {
      const length = Math.min(chunk, size - offset);
      this.runtime.fileWrite.appendBytes(path, new Uint8Array(reader.readLoadedBytes(offset, length)));
    }
    if (size === 0) this.runtime.fileWrite.appendBytes(path, new Uint8Array(0));
  }

  /**
   * `snapshot()` onto a file: `path` ends up holding the document a save
   * would write — the loaded bytes when nothing changed, else the standalone
   * save — without the document ever being an in-memory buffer. Native only.
   */
  snapshotToFile(path: string): { path: string; source: SaveSource } {
    if (!this.session.hasUnsavedEdits()) {
      this.copyLoadedBytesToFile(path);
      return { path, source: 'loaded' };
    }
    const saved = this.saveStandaloneToFileEx(path, 'incremental');
    if (saved.unchangedSinceLoad) {
      this.copyLoadedBytesToFile(path);
      return { path, source: 'loaded' };
    }
    return { path, source: 'working-copy' };
  }

  /** Whether this runtime and session can put scratch output beside the base file. */
  canWriteScratchFiles(): boolean {
    return this.runtime.kind === 'native' && this.session.source.base?.kind === 'file';
  }

  saveLayerArtifact(): { bytes: ArrayBuffer; size: number } {
    const saved = this.saveLayerArtifactImpl(/*reporting=*/ false);
    if (saved.size <= 0) {
      throw layerSaveError(-1);
    }
    return { bytes: saved.bytes, size: saved.size };
  }

  /**
   * `saveLayerArtifact` that says whether anything reachable changed since
   * the layer was opened. When nothing did, `bytes` is empty and the
   * artifact the session was opened with stands. The artifact written
   * otherwise is cumulative against the base (empty delta when the layer
   * came to equal its base).
   */
  saveLayerArtifactEx(): { bytes: ArrayBuffer; size: number; changedSinceLoad: boolean } {
    return this.saveLayerArtifactImpl(/*reporting=*/ true);
  }

  /**
   * `saveLayerArtifactEx` onto a file: nothing reaches `path` when nothing
   * changed since load. The delta inside is streamed, never held whole.
   * Native only.
   */
  saveLayerArtifactToFileEx(path: string): { path: string; changedSinceLoad: boolean } {
    this.requireLayer();
    return this.saveLayerToFileImpl(path, 'artifact');
  }

  /** `saveLayerDeltaEx` onto a file: the cumulative delta, or nothing when nothing changed since load. Native only. */
  saveLayerDeltaToFileEx(path: string): { path: string; changedSinceLoad: boolean } {
    this.requireLayer();
    return this.saveLayerToFileImpl(path, 'delta');
  }

  private saveLayerToFileImpl(
    path: string,
    what: 'artifact' | 'delta',
  ): { path: string; changedSinceLoad: boolean } {
    const { mem, fn } = this.runtime;
    const statusPtr = mem.alloc(4);
    const changedPtr = mem.alloc(4);
    this.runtime.fileWrite.removeFile(path);
    const writer = this.runtime.fileWrite.toNodeFile(path);
    try {
      mem.poke(statusPtr, 'i32', -1);
      mem.poke(changedPtr, 'i32', 1);
      const ok =
        what === 'artifact'
          ? fn.EPDFLayer_SaveLayerArtifactEx(this.session.requireDocPtr(), writer.ptr, statusPtr, changedPtr)
          : fn.EPDFLayer_SaveDeltaEx(this.session.requireDocPtr(), writer.ptr, statusPtr, changedPtr);
      const status = Number(mem.peek(statusPtr, 'i32'));
      if (!ok || status !== 0) {
        throw layerSaveError(status);
      }
      return { path, changedSinceLoad: Number(mem.peek(changedPtr, 'i32')) !== 0 };
    } finally {
      writer.close();
      mem.free(changedPtr);
      mem.free(statusPtr);
    }
  }

  private saveLayerArtifactImpl(reporting: boolean): {
    bytes: ArrayBuffer;
    size: number;
    changedSinceLoad: boolean;
  } {
    this.requireLayer();

    const { mem, fn } = this.runtime;
    const sizePtr = mem.alloc(8);
    const statusPtr = mem.alloc(4);
    const changedPtr = mem.alloc(4);
    let artifactPtr: Ptr | null = null;
    try {
      mem.poke(sizePtr, 'i32', 0);
      mem.poke(statusPtr, 'i32', -1);
      mem.poke(changedPtr, 'i32', 1);
      artifactPtr = reporting
        ? fn.EPDFLayer_SaveLayerArtifactToOwnedBufferEx(
            this.session.requireDocPtr(),
            sizePtr,
            statusPtr,
            changedPtr,
          )
        : fn.EPDFLayer_SaveLayerArtifactToOwnedBuffer(
            this.session.requireDocPtr(),
            sizePtr,
            statusPtr,
          );
      const status = Number(mem.peek(statusPtr, 'i32'));
      const size = Number(mem.peek(sizePtr, 'i32'));
      const changedSinceLoad = reporting ? Number(mem.peek(changedPtr, 'i32')) !== 0 : true;
      if (status !== 0) {
        throw layerSaveError(status);
      }
      if (reporting && !changedSinceLoad) {
        return { bytes: new ArrayBuffer(0), size: 0, changedSinceLoad: false };
      }
      if (!artifactPtr || size <= 0) {
        throw layerSaveError(status);
      }

      const bytes = mem.readBytes(artifactPtr, size);
      const buffer = new ArrayBuffer(bytes.byteLength);
      new Uint8Array(buffer).set(bytes);
      return { bytes: buffer, size, changedSinceLoad };
    } finally {
      if (artifactPtr) fn.EPDF_FreeBuffer(artifactPtr);
      mem.free(changedPtr);
      mem.free(statusPtr);
      mem.free(sizePtr);
    }
  }

  /**
   * The raw cumulative delta a layer save writes (every promoted object,
   * offsets notional from the base's append offset), without the artifact
   * header: what `EPDFDoc_OpenBaseOverlay` composes with the base. Empty
   * when nothing was promoted.
   */
  saveLayerDelta(): { bytes: ArrayBuffer; size: number } {
    const saved = this.saveLayerDeltaImpl(/*reporting=*/ false);
    return { bytes: saved.bytes, size: saved.size };
  }

  /**
   * `saveLayerDelta` that says whether anything reachable changed since the
   * layer was opened; empty bytes when nothing did (keep what you have), or
   * when the layer came to equal its base (then `changedSinceLoad` is true
   * and the document is the base).
   */
  saveLayerDeltaEx(): { bytes: ArrayBuffer; size: number; changedSinceLoad: boolean } {
    return this.saveLayerDeltaImpl(/*reporting=*/ true);
  }

  private saveLayerDeltaImpl(reporting: boolean): {
    bytes: ArrayBuffer;
    size: number;
    changedSinceLoad: boolean;
  } {
    this.requireLayer();

    const { mem, fn } = this.runtime;
    const sizePtr = mem.alloc(8);
    const statusPtr = mem.alloc(4);
    const changedPtr = mem.alloc(4);
    let deltaPtr: Ptr | null = null;
    try {
      mem.poke(sizePtr, 'i32', 0);
      mem.poke(statusPtr, 'i32', -1);
      mem.poke(changedPtr, 'i32', 1);
      deltaPtr = reporting
        ? fn.EPDFLayer_SaveDeltaToOwnedBufferEx(
            this.session.requireDocPtr(),
            sizePtr,
            statusPtr,
            changedPtr,
          )
        : fn.EPDFLayer_SaveDeltaToOwnedBuffer(this.session.requireDocPtr(), sizePtr, statusPtr);
      const status = Number(mem.peek(statusPtr, 'i32'));
      const size = Number(mem.peek(sizePtr, 'i32'));
      const changedSinceLoad = reporting ? Number(mem.peek(changedPtr, 'i32')) !== 0 : true;
      if (status !== 0) {
        throw layerSaveError(status);
      }
      if (!deltaPtr || size <= 0) {
        return { bytes: new ArrayBuffer(0), size: 0, changedSinceLoad };
      }
      const bytes = mem.readBytes(deltaPtr, size);
      const buffer = new ArrayBuffer(bytes.byteLength);
      new Uint8Array(buffer).set(bytes);
      return { bytes: buffer, size, changedSinceLoad };
    } finally {
      if (deltaPtr) fn.EPDF_FreeBuffer(deltaPtr);
      mem.free(changedPtr);
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
    // unsigned long is 64-bit on Unix native targets and 32-bit in WASM.
    const sizePtr = mem.alloc(8);
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

      return { bytes: readSavedBuffer(mem, pdfPtr, size), size };
    } finally {
      if (pdfPtr) fn.EPDF_FreeBuffer(pdfPtr);
      mem.free(sizePtr);
    }
  }

  /**
   * `saveStandaloneToBuffer` that says whether the save wrote anything. An
   * incremental save of a layer never rewrites an object equal to its base
   * twin, and when no reachable object differs from the document the layer
   * was opened with it writes nothing at all: `unchangedSinceLoad`, empty
   * bytes — the loaded bytes are the document.
   */
  saveStandaloneToBufferEx(mode: PdfSaveMode): {
    bytes: ArrayBuffer;
    size: number;
    unchangedSinceLoad: boolean;
  } {
    const { mem, fn } = this.runtime;
    const sizePtr = mem.alloc(8);
    const statusPtr = mem.alloc(4);
    let pdfPtr: Ptr | null = null;
    try {
      mem.poke(sizePtr, 'i32', 0);
      mem.poke(statusPtr, 'i32', 0);
      pdfPtr = fn.EPDF_SaveDocumentToOwnedBufferEx(
        this.session.requireDocPtr(),
        pdfSaveModeFlags(mode),
        0,
        sizePtr,
        statusPtr,
      );
      const status = Number(mem.peek(statusPtr, 'i32'));
      if (status === EPDF_SAVE_UNCHANGED_SINCE_LOAD) {
        return { bytes: new ArrayBuffer(0), size: 0, unchangedSinceLoad: true };
      }
      const size = Number(mem.peek(sizePtr, 'i32'));
      if (!pdfPtr || size <= 0 || status !== EPDF_SAVE_WRITTEN) {
        throw new EngineError(EngineErrorCode.DocOpenFailed, 'failed to save document');
      }
      return {
        bytes: readSavedBuffer(mem, pdfPtr, size),
        size,
        unchangedSinceLoad: false,
      };
    } finally {
      if (pdfPtr) fn.EPDF_FreeBuffer(pdfPtr);
      mem.free(statusPtr);
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

  /**
   * `saveStandaloneToFile` with the report of `saveStandaloneToBufferEx`.
   * On `unchangedSinceLoad` no byte reached the file: the caller streams
   * the loaded bytes instead.
   */
  saveStandaloneToFileEx(path: string, mode: PdfSaveMode): { path: string; unchangedSinceLoad: boolean } {
    const { mem, fn } = this.runtime;
    const writer = this.runtime.fileWrite.toNodeFile(path);
    const statusPtr = mem.alloc(4);
    try {
      mem.poke(statusPtr, 'i32', 0);
      const ok = fn.EPDF_SaveAsCopyEx(
        this.session.requireDocPtr(),
        writer.ptr,
        pdfSaveModeFlags(mode),
        statusPtr,
      );
      const status = Number(mem.peek(statusPtr, 'i32'));
      if (!ok || status === 0) {
        throw new EngineError(EngineErrorCode.DocOpenFailed, 'failed to save document');
      }
      return { path, unchangedSinceLoad: status === EPDF_SAVE_UNCHANGED_SINCE_LOAD };
    } finally {
      mem.free(statusPtr);
      writer.close();
    }
  }

  private requireLayer(): void {
    if (this.session.kind !== 'layer') {
      throw new EngineError(EngineErrorCode.InvalidArg, 'document session is not a layer');
    }
  }
}
