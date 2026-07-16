import type {
  AnnotationRef,
  AttachmentFileWorkerPayload,
  EmbeddedFileItem,
  EmbeddedFileRef,
  PageObjectNumber,
} from '@embedpdf/engine-core/runtime';
import { EngineError, EngineErrorCode } from '@embedpdf/engine-core/runtime';
import type { PdfRuntimeModule, Ptr } from '@embedpdf/pdf-runtime';

import {
  extractAttachmentToBuffer,
  extractAttachmentToFile,
  readAttachmentFileInfo,
  readAttachmentKey,
  resolveAttachmentIndex,
} from './internal/attachmentPrimitives';
import type { DocumentSession } from '../../document-session/DocumentSession';
import { throwIfAborted } from '../../shared/abort';
import { resolveAnnotPtr } from '../annotations/internal/identity/resolveAnnotationPointer';

/**
 * Read-only access to embedded files, at both of their homes: the
 * document catalog's `/EmbeddedFiles` name tree (list / readFile by
 * index) and a FileAttachment annotation's `/FS` (readAnnotationFile by
 * ref). Pure READS over the session — no revision bumps, no layer
 * artifacts (the `PagesExtractor` shape).
 *
 * Byte delivery mirrors the request's `path?`: absent → a standalone
 * buffer for the transfer list (browser); present → the decoded file is
 * streamed to `path` via `FPDF_FILEWRITE` (server), and only metadata
 * rides the response.
 */
export class AttachmentReader {
  constructor(
    private readonly runtime: PdfRuntimeModule,
    private readonly session: DocumentSession,
  ) {}

  /** Snapshot of the `/EmbeddedFiles` name tree, in tree (key-sorted) order. */
  list(signal: AbortSignal): EmbeddedFileItem[] {
    throwIfAborted(signal);
    const { fn, mem } = this.runtime;
    const docPtr = this.session.requireDocPtr();
    const count = fn.FPDFDoc_GetAttachmentCount(docPtr);
    const items: EmbeddedFileItem[] = [];
    for (let index = 0; index < count; index++) {
      const attachmentPtr = fn.FPDFDoc_GetAttachment(docPtr, index);
      if (!attachmentPtr) continue;
      const key = readAttachmentKey(fn, mem, docPtr, index) ?? '';
      items.push({ ...readAttachmentFileInfo(fn, mem, attachmentPtr), key, index });
    }
    return items;
  }

  /** Decode one document-level embedded file, addressed by key. */
  readFile(
    ref: EmbeddedFileRef,
    path: string | undefined,
    maxDecodedBytes: number | undefined,
    signal: AbortSignal,
  ): AttachmentFileWorkerPayload {
    throwIfAborted(signal);
    const { fn, mem } = this.runtime;
    const docPtr = this.session.requireDocPtr();
    const index = resolveAttachmentIndex(fn, mem, docPtr, ref);
    if (index < 0) {
      throw new EngineError(
        EngineErrorCode.NotFound,
        `no embedded file with key '${ref.key}' in the document`,
      );
    }
    const attachmentPtr = fn.FPDFDoc_GetAttachment(docPtr, index);
    if (!attachmentPtr) {
      throw new EngineError(
        EngineErrorCode.Unknown,
        `embedded file with key '${ref.key}' resolved to index ${index} but could not be opened`,
      );
    }
    const info = readAttachmentFileInfo(fn, mem, attachmentPtr);
    return this.extract(attachmentPtr, info.name, info.mimeType, path, maxDecodedBytes);
  }

  /** Decode the file embedded in a FileAttachment annotation's `/FS`. */
  readAnnotationFile(
    pageObjectNumber: PageObjectNumber,
    ref: AnnotationRef,
    path: string | undefined,
    maxDecodedBytes: number | undefined,
    signal: AbortSignal,
  ): AttachmentFileWorkerPayload {
    throwIfAborted(signal);
    const { fn, mem } = this.runtime;
    const pool = this.session.pagePool();
    const pagePtr = pool.acquire(pageObjectNumber);
    let annotPtr: Ptr | null = null;
    try {
      annotPtr = resolveAnnotPtr(this.runtime, this.session, pagePtr, ref);
      const attachmentPtr = fn.FPDFAnnot_GetFileAttachment(annotPtr);
      if (!attachmentPtr) {
        throw new EngineError(
          EngineErrorCode.InvalidArg,
          'annotation is not a file attachment or carries no embedded file (/FS)',
        );
      }
      const info = readAttachmentFileInfo(fn, mem, attachmentPtr);
      return this.extract(attachmentPtr, info.name, info.mimeType, path, maxDecodedBytes);
    } finally {
      if (annotPtr !== null) fn.FPDFPage_CloseAnnot(annotPtr);
      pool.release(pageObjectNumber);
    }
  }

  private extract(
    attachmentPtr: Ptr,
    name: string,
    mimeType: string | undefined,
    path: string | undefined,
    maxDecodedBytes: number | undefined,
  ): AttachmentFileWorkerPayload {
    if (path !== undefined) {
      const { size } = extractAttachmentToFile(this.runtime, attachmentPtr, path, maxDecodedBytes);
      return { name, ...(mimeType ? { mimeType } : {}), size, path };
    }
    const { bytes, size } = extractAttachmentToBuffer(this.runtime, attachmentPtr, maxDecodedBytes);
    return { name, ...(mimeType ? { mimeType } : {}), size, bytes };
  }
}
