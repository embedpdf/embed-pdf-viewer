import { EngineError, EngineErrorCode, type BinaryMetadata } from '@embedpdf/engine-core/runtime';
import {
  NULL_PTR,
  type PdfFunctions,
  type PdfRuntimeMemory,
  type Ptr,
} from '@embedpdf/engine-runtime';

import type { DrawingIndex } from '../../../../document-session/DrawingIndex';
import { withScratch } from '../../../../runtime/memory/scratch';
import { sha256Hex } from '../../../../runtime/digest';
import { withAppearanceDocument } from '../appearanceDocument';

const FPDF_NO_INCREMENTAL = 1 << 1;
/** Room for an `unsigned long` out-parameter: 8 bytes on 64-bit native. */
const ULONG_SLOT = 8;

/**
 * The drawing a stamp places for `bytes` (PNG, JPEG or a one-page PDF), by
 * object number: one the document already has, when the content is the
 * same, or a new one.
 *
 *   1. Bytes placed before are the drawing they made (the source note).
 *   2. Otherwise the bytes become their canonical drawing in a document of
 *      its own, which is hashed; the document isn't touched.
 *   3. A drawing of the document with that content is placed again;
 *      otherwise the canonical drawing is added as a new one.
 *
 * So a hundred placements of one stamp add one drawing, and a PNG and the
 * drawing exported from it are the same drawing.
 */
export function drawingFor(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  docPtr: Ptr,
  index: DrawingIndex,
  bytes: ArrayBuffer,
  meta: BinaryMetadata,
): number {
  const hashed = index.hashes.get(bytes);
  const placed = hashed === undefined ? undefined : index.bySource.get(hashed);
  if (placed !== undefined) return placed;
  const dataPtr = mem.alloc(bytes.byteLength);
  try {
    mem.writeBytes(dataPtr, new Uint8Array(bytes));
    const source = hashed ?? sha256Hex(fn, mem, dataPtr, bytes.byteLength);
    index.hashes.set(bytes, source);
    const noted = index.bySource.get(source);
    if (noted !== undefined) return noted;

    const canonicalPtr = withAppearanceDocument(
      fn,
      mem,
      dataPtr,
      bytes.byteLength,
      meta,
      (srcPtr) => fn.EPDFDoc_CanonicalDrawing(srcPtr, 0),
    );
    if (!canonicalPtr) {
      throw new EngineError(EngineErrorCode.Unknown, 'EPDFDoc_CanonicalDrawing returned NULL');
    }
    try {
      const content = savedDigest(fn, mem, canonicalPtr);
      const byContent = contentIndex(fn, mem, docPtr, index);
      let drawing = byContent.get(content);
      if (drawing === undefined) {
        drawing = fn.EPDFDoc_ImportDrawing(docPtr, canonicalPtr);
        if (!drawing) {
          throw new EngineError(EngineErrorCode.Unknown, 'EPDFDoc_ImportDrawing returned 0');
        }
        byContent.set(content, drawing);
      }
      index.bySource.set(source, drawing);
      return drawing;
    } finally {
      fn.FPDF_CloseDocument(canonicalPtr);
    }
  } finally {
    mem.free(dataPtr);
  }
}

/**
 * Content id → drawing for the drawings the document's annotations show (a
 * stamp's, a mark's in a widget, a push button's icons), built on first use:
 * each is exported and hashed once.
 */
function contentIndex(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  docPtr: Ptr,
  index: DrawingIndex,
): Map<string, number> {
  if (index.byContent) return index.byContent;
  const byContent = new Map<string, number>();
  const count = fn.EPDFDoc_GetDrawings(docPtr, NULL_PTR, 0);
  const drawings =
    count > 0
      ? withScratch(mem, 4 * count, (buffer) => {
          fn.EPDFDoc_GetDrawings(docPtr, buffer, count);
          return Array.from(
            { length: count },
            (_, i) => Number(mem.peek(buffer, 'i32', 4 * i)) >>> 0,
          );
        })
      : [];
  for (const drawing of drawings) {
    const exportedPtr = fn.EPDFDoc_ExportDrawing(docPtr, drawing);
    if (!exportedPtr) continue;
    try {
      const content = savedDigest(fn, mem, exportedPtr);
      if (!byContent.has(content)) byContent.set(content, drawing);
    } finally {
      fn.FPDF_CloseDocument(exportedPtr);
    }
  }
  index.byContent = byContent;
  return byContent;
}

/** SHA-256 (hex) of a document's full save: a drawing's content id. */
function savedDigest(fn: PdfFunctions, mem: PdfRuntimeMemory, docPtr: Ptr): string {
  return withScratch(mem, ULONG_SLOT, (sizePtr) => {
    mem.poke(sizePtr, 'i32', 0, 0);
    mem.poke(sizePtr, 'i32', 0, 4);
    const pdfPtr = fn.EPDF_SaveDocumentToOwnedBuffer(docPtr, FPDF_NO_INCREMENTAL, sizePtr);
    const size = Number(mem.peek(sizePtr, 'i32', 0));
    if (!pdfPtr || size <= 0) {
      if (pdfPtr) fn.EPDF_FreeBuffer(pdfPtr);
      throw new EngineError(EngineErrorCode.Unknown, 'failed to save a stamp drawing');
    }
    try {
      return sha256Hex(fn, mem, pdfPtr, size);
    } finally {
      fn.EPDF_FreeBuffer(pdfPtr);
    }
  });
}

/** The page count of PDF bytes, or `null` when they don't open. */
export function pdfPageCountOf(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  bytes: ArrayBuffer,
): number | null {
  const dataPtr = mem.alloc(bytes.byteLength);
  try {
    mem.writeBytes(dataPtr, new Uint8Array(bytes));
    const docPtr = fn.FPDF_LoadMemDocument(dataPtr, bytes.byteLength, '');
    if (!docPtr) return null;
    try {
      return fn.FPDF_GetPageCount(docPtr);
    } finally {
      fn.FPDF_CloseDocument(docPtr);
    }
  } finally {
    mem.free(dataPtr);
  }
}
