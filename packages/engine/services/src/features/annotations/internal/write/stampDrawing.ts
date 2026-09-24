import { EngineError, EngineErrorCode, type BinaryMetadata } from '@embedpdf/engine-core/runtime';
import {
  NULL_PTR,
  type PdfFunctions,
  type PdfRuntimeMemory,
  type Ptr,
} from '@embedpdf/engine-runtime';

import type { DrawingIndex } from '../../../../document-session/DrawingIndex';
import { withScratch } from '../../../../runtime/memory/scratch';
import { F32_BYTES } from '../../../../runtime/memory/structs';
import { sha256Hex } from '../digest';

const FPDF_NO_INCREMENTAL = 1 << 1;
/** Room for an `unsigned long` out-parameter: 8 bytes on 64-bit native. */
const ULONG_SLOT = 8;

/** Acrobat's page size limit: a drawing larger than this is scaled down to fit. */
const MAX_DRAWING_SIZE = 14_400;

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
  const dataPtr = mem.alloc(bytes.byteLength);
  try {
    mem.writeBytes(dataPtr, new Uint8Array(bytes));
    const source = sha256Hex(fn, mem, dataPtr, bytes.byteLength);
    const noted = index.bySource.get(source);
    if (noted !== undefined) return noted;

    const canonicalPtr = withSourceDocument(fn, mem, dataPtr, bytes.byteLength, meta, (srcPtr) =>
      fn.EPDFDoc_CanonicalDrawing(srcPtr, 0),
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
 * Content id → drawing for the drawings the document's stamps place, built
 * on first use: each is exported and hashed once.
 */
function contentIndex(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  docPtr: Ptr,
  index: DrawingIndex,
): Map<string, number> {
  if (index.byContent) return index.byContent;
  const byContent = new Map<string, number>();
  const count = fn.EPDFDoc_GetStampDrawings(docPtr, NULL_PTR, 0);
  const drawings =
    count > 0
      ? withScratch(mem, 4 * count, (buffer) => {
          fn.EPDFDoc_GetStampDrawings(docPtr, buffer, count);
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

/**
 * Run `body` with a document holding the bytes as one page: the PDF itself,
 * or the image at its own size. `dataPtr` must stay alive until then.
 */
function withSourceDocument<T>(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  dataPtr: Ptr,
  size: number,
  meta: BinaryMetadata,
  body: (docPtr: Ptr) => T,
): T {
  if (meta.mimeType === 'application/pdf') {
    const docPtr = fn.FPDF_LoadMemDocument(dataPtr, size, '');
    if (!docPtr) {
      throw new EngineError(
        EngineErrorCode.MalformedPdf,
        "the stamp's appearance PDF could not be opened",
      );
    }
    try {
      return body(docPtr);
    } finally {
      fn.FPDF_CloseDocument(docPtr);
    }
  }
  return withImageDocument(fn, mem, dataPtr, size, meta, body);
}

/**
 * PNG or JPEG → the image at its own size, as a one-page document: a pixel
 * is a point, scaled down to fit {@link MAX_DRAWING_SIZE}. The drawing
 * doesn't depend on any stamp's box or fit, which its wrapper applies: a
 * later `fit` shows the whole image, and the same image is always the same
 * drawing.
 */
function withImageDocument<T>(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  dataPtr: Ptr,
  size: number,
  meta: BinaryMetadata,
  body: (docPtr: Ptr) => T,
): T {
  if (!('width' in meta)) {
    throw new EngineError(EngineErrorCode.InvalidArg, 'the stamp image has no size');
  }
  const scale = Math.min(1, MAX_DRAWING_SIZE / Math.max(meta.width, meta.height));
  const width = meta.width * scale;
  const height = meta.height * scale;
  const docPtr = fn.FPDF_CreateNewDocument();
  if (!docPtr) {
    throw new EngineError(EngineErrorCode.Unknown, 'FPDF_CreateNewDocument returned NULL');
  }
  try {
    const pagePtr = fn.FPDFPage_New(docPtr, 0, width, height);
    if (!pagePtr) {
      throw new EngineError(EngineErrorCode.Unknown, 'FPDFPage_New returned NULL');
    }
    try {
      const imageObjPtr = fn.FPDFPageObj_NewImageObj(docPtr);
      if (!imageObjPtr) {
        throw new EngineError(EngineErrorCode.Unknown, 'FPDFPageObj_NewImageObj returned NULL');
      }
      let inserted = false;
      try {
        const ok =
          meta.mimeType === 'image/png'
            ? fn.EPDFImageObj_SetPng(NULL_PTR, 0, imageObjPtr, dataPtr, size)
            : fn.EPDFImageObj_SetJpeg(NULL_PTR, 0, imageObjPtr, dataPtr, size);
        if (!ok) {
          throw new EngineError(
            EngineErrorCode.InvalidArg,
            `${meta.mimeType === 'image/png' ? 'EPDFImageObj_SetPng' : 'EPDFImageObj_SetJpeg'} rejected the image data`,
          );
        }
        setImageMatrix(fn, mem, imageObjPtr, width, height);
        fn.FPDFPage_InsertObject(pagePtr, imageObjPtr);
        inserted = true;
      } finally {
        // The page owns the object once inserted; on failure we own it.
        if (!inserted) fn.FPDFPageObj_Destroy(imageObjPtr);
      }
      if (!fn.FPDFPage_GenerateContent(pagePtr)) {
        throw new EngineError(EngineErrorCode.Unknown, 'FPDFPage_GenerateContent returned false');
      }
    } finally {
      fn.FPDF_ClosePage(pagePtr);
    }
    return body(docPtr);
  } finally {
    fn.FPDF_CloseDocument(docPtr);
  }
}

/** FS_MATRIX { a, b, c, d, e, f } — six f32s. */
function setImageMatrix(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  imageObjPtr: Ptr,
  width: number,
  height: number,
): void {
  withScratch(mem, 6 * F32_BYTES, (buf) => {
    mem.poke(buf, 'f32', width, 0);
    mem.poke(buf, 'f32', 0, 4);
    mem.poke(buf, 'f32', 0, 8);
    mem.poke(buf, 'f32', height, 12);
    mem.poke(buf, 'f32', 0, 16);
    mem.poke(buf, 'f32', 0, 20);
    if (!fn.FPDFPageObj_SetMatrix(imageObjPtr, buf)) {
      throw new EngineError(EngineErrorCode.Unknown, 'FPDFPageObj_SetMatrix returned false');
    }
  });
}
