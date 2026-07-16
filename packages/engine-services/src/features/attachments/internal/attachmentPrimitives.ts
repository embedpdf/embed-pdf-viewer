import type {
  AttachmentFileInfo,
  EmbeddedFileRef,
  WireResource,
} from '@embedpdf/engine-core/runtime';
import { EngineError, EngineErrorCode } from '@embedpdf/engine-core/runtime';
import { NULL_PTR } from '@embedpdf/pdf-runtime';
import type { PdfFunctions, PdfRuntimeMemory, PdfRuntimeModule, Ptr } from '@embedpdf/pdf-runtime';

import { readUtf16String, writeUtf16String } from '../../../runtime/memory/strings';

/**
 * Shared primitives over an `FPDF_ATTACHMENT` handle (an unretained
 * filespec pointer — no close call exists or is needed). Used by both
 * homes an embedded file can have: the document-level `/EmbeddedFiles`
 * name tree (`AttachmentReader`) and a FileAttachment annotation's `/FS`
 * (the annotation reader + `downloadFile`).
 */

/** Read the name-tree KEY at |index| — the durable EmbeddedFileRef address. */
export function readAttachmentKey(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  docPtr: Ptr,
  index: number,
): string | null {
  return readUtf16String(mem, (buf, cap) => fn.EPDFDoc_GetAttachmentKey(docPtr, index, buf, cap));
}

/** Resolve an EmbeddedFileRef to its CURRENT name-tree index, or -1. */
export function resolveAttachmentIndex(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  docPtr: Ptr,
  ref: EmbeddedFileRef,
): number {
  const keyPtr = mem.writeU16String(ref.key);
  try {
    return fn.EPDFDoc_GetAttachmentIndexByKey(docPtr, keyPtr);
  } finally {
    mem.free(keyPtr);
  }
}

/**
 * Write an embedded file's payload onto an existing FPDF_ATTACHMENT:
 * bytes via FPDFAttachment_SetFile (which also writes /Params
 * Size/CheckSum/CreationDate), declared mime via EPDFAttachment_SetSubtype
 * (attachments accept any format — no sniffing), optional /Desc. Shared
 * by the file-attachment annotation writer and the document-level
 * `attachments.create` mutation — the write half of the one attachment
 * vocabulary.
 */
export function writeAttachmentFilePayload(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  attachmentPtr: Ptr,
  docPtr: Ptr,
  file: { mimeType?: string; description?: string },
  resource: WireResource,
): void {
  const byteLength = resource.bytes.byteLength;
  if (byteLength === 0) {
    // Valid zero-byte attachment: PDFium accepts (NULL, 0).
    if (!fn.FPDFAttachment_SetFile(attachmentPtr, docPtr, NULL_PTR, 0)) {
      throw new EngineError(EngineErrorCode.Unknown, 'FPDFAttachment_SetFile returned false');
    }
  } else {
    const dataPtr = mem.alloc(byteLength);
    try {
      mem.writeBytes(dataPtr, new Uint8Array(resource.bytes));
      if (!fn.FPDFAttachment_SetFile(attachmentPtr, docPtr, dataPtr, byteLength)) {
        throw new EngineError(EngineErrorCode.Unknown, 'FPDFAttachment_SetFile returned false');
      }
    } finally {
      mem.free(dataPtr);
    }
  }

  if (!fn.EPDFAttachment_SetSubtype(attachmentPtr, file.mimeType ?? 'application/octet-stream')) {
    throw new EngineError(EngineErrorCode.Unknown, 'EPDFAttachment_SetSubtype returned false');
  }
  if (file.description !== undefined) {
    const ok = writeUtf16String(mem, file.description, (ptr) =>
      fn.EPDFAttachment_SetDescription(attachmentPtr, ptr),
    );
    if (!ok) {
      throw new EngineError(
        EngineErrorCode.Unknown,
        'EPDFAttachment_SetDescription returned false',
      );
    }
  }
}

/** Read the metadata projection of an embedded file (never its bytes). */
export function readAttachmentFileInfo(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  attachmentPtr: Ptr,
): AttachmentFileInfo {
  const name =
    readUtf16String(mem, (buf, cap) => fn.FPDFAttachment_GetName(attachmentPtr, buf, cap)) ?? '';
  const mimeType = readUtf16String(mem, (buf, cap) =>
    fn.FPDFAttachment_GetSubtype(attachmentPtr, buf, cap),
  );
  const description = readUtf16String(mem, (buf, cap) =>
    fn.EPDFAttachment_GetDescription(attachmentPtr, buf, cap),
  );
  const creationDate = readAttachmentString(fn, mem, attachmentPtr, 'CreationDate');
  const checksum = normalizeChecksum(readAttachmentString(fn, mem, attachmentPtr, 'CheckSum'));
  const size = readAttachmentSize(fn, mem, attachmentPtr);

  return {
    name,
    ...(mimeType ? { mimeType } : {}),
    ...(description ? { description } : {}),
    ...(size !== null ? { size } : {}),
    ...(checksum ? { checksum } : {}),
    ...(creationDate ? { creationDate } : {}),
  };
}

/**
 * Decode the embedded file into a standalone buffer via the fork's
 * single-decode `EPDFAttachment_ExtractFileToOwnedBuffer`. A zero-byte
 * embedded file is a valid `{ size: 0 }` result.
 */
export function extractAttachmentToBuffer(
  runtime: PdfRuntimeModule,
  attachmentPtr: Ptr,
  maxDecodedBytes: number | undefined,
): { bytes: ArrayBuffer; size: number } {
  const { fn, mem } = runtime;
  const bufPtrSlot = mem.alloc(8); // void** — 8 bytes covers wasm32 and native
  const sizePtr = mem.alloc(4);
  const statusPtr = mem.alloc(4);
  let dataPtr: Ptr | null = null;
  try {
    // Plain 0 (not 0n): the wasm memory writes pointer slots via
    // Emscripten setValue, which rejects BigInt for 32-bit pointers.
    mem.poke(bufPtrSlot, 'ptr', 0);
    mem.poke(sizePtr, 'i32', 0);
    mem.poke(statusPtr, 'i32', -1);
    const ok = fn.EPDFAttachment_ExtractFileToOwnedBuffer(
      attachmentPtr,
      BigInt(maxDecodedBytes ?? 0),
      bufPtrSlot,
      sizePtr,
      statusPtr,
    );
    if (!ok) {
      throw extractStatusError(Number(mem.peek(statusPtr, 'i32')));
    }
    const size = Number(mem.peek(sizePtr, 'i32')) >>> 0;
    dataPtr = mem.peek(bufPtrSlot, 'ptr') as Ptr;
    if (size === 0 || !dataPtr) {
      return { bytes: new ArrayBuffer(0), size: 0 };
    }
    const view = mem.readBytes(dataPtr, size);
    const buffer = new ArrayBuffer(view.byteLength);
    new Uint8Array(buffer).set(view);
    return { bytes: buffer, size };
  } finally {
    if (dataPtr) fn.EPDF_FreeBuffer(dataPtr);
    mem.free(statusPtr);
    mem.free(sizePtr);
    mem.free(bufPtrSlot);
  }
}

/**
 * Decode the embedded file straight to `path` via the fork's streaming
 * `EPDFAttachment_ExtractFile` + `FPDF_FILEWRITE` — the server mode: the
 * decoded payload never crosses the thread boundary and HTTP streams it
 * from disk. On failure the destination may hold a partial file (the
 * caller owns temp-file cleanup, as with `document.saveFile`).
 */
export function extractAttachmentToFile(
  runtime: PdfRuntimeModule,
  attachmentPtr: Ptr,
  path: string,
  maxDecodedBytes: number | undefined,
): { size: number } {
  const { fn, mem } = runtime;
  const sizePtr = mem.alloc(4);
  const statusPtr = mem.alloc(4);
  const writer = runtime.fileWrite.toNodeFile(path);
  try {
    mem.poke(sizePtr, 'i32', 0);
    mem.poke(statusPtr, 'i32', -1);
    const ok = fn.EPDFAttachment_ExtractFile(
      attachmentPtr,
      writer.ptr,
      BigInt(maxDecodedBytes ?? 0),
      sizePtr,
      statusPtr,
    );
    if (!ok) {
      throw extractStatusError(Number(mem.peek(statusPtr, 'i32')));
    }
    return { size: Number(mem.peek(sizePtr, 'i32')) >>> 0 };
  } finally {
    writer.close();
    mem.free(statusPtr);
    mem.free(sizePtr);
  }
}

/** `EPDFAttachmentExtractStatus` (public/fpdf_attachment.h) → EngineError. */
function extractStatusError(status: number): EngineError {
  switch (status) {
    case 1: // kNoFileStream
      return new EngineError(
        EngineErrorCode.InvalidArg,
        'attachment has no embedded file stream (missing /EF)',
      );
    case 2: // kDecodeFailed
      return new EngineError(EngineErrorCode.MalformedPdf, 'embedded file stream failed to decode');
    case 3: // kSizeLimitExceeded
      return new EngineError(
        EngineErrorCode.InvalidArg,
        'embedded file exceeds the configured decoded-size limit',
      );
    case 4: // kWriteFailed
      return new EngineError(EngineErrorCode.Unknown, 'writing the extracted attachment failed');
    default:
      return new EngineError(
        EngineErrorCode.Unknown,
        `attachment extraction failed (status ${status})`,
      );
  }
}

function readAttachmentString(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  attachmentPtr: Ptr,
  key: string,
): string | null {
  if (!fn.FPDFAttachment_HasKey(attachmentPtr, key)) return null;
  return readUtf16String(
    mem,
    (buf, cap) => fn.FPDFAttachment_GetStringValue(attachmentPtr, key, buf, cap),
    null,
  );
}

function readAttachmentSize(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  attachmentPtr: Ptr,
): number | null {
  const out = mem.alloc(4);
  try {
    if (!fn.EPDFAttachment_GetIntegerValue(attachmentPtr, 'Size', out)) return null;
    const size = Number(mem.peek(out, 'i32'));
    return size >= 0 ? size : null;
  } finally {
    mem.free(out);
  }
}

/** PDFium reports `/CheckSum` hex strings as `<ABCD…>` — normalize to bare lowercase hex. */
function normalizeChecksum(raw: string | null): string | null {
  if (!raw) return null;
  const inner = raw.startsWith('<') && raw.endsWith('>') ? raw.slice(1, -1) : raw;
  return /^[0-9a-fA-F]+$/.test(inner) ? inner.toLowerCase() : raw;
}
