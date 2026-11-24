import { EngineError, EngineErrorCode, type BinaryMetadata } from '@embedpdf/engine-core/runtime';
import {
  NULL_PTR,
  type PdfFunctions,
  type PdfRuntimeMemory,
  type Ptr,
} from '@embedpdf/engine-runtime';

import { withScratch } from '../../../runtime/memory/scratch';
import { F32_BYTES } from '../../../runtime/memory/structs';

/** Acrobat's page size limit: a drawing larger than this is scaled down to fit. */
const MAX_DRAWING_SIZE = 14_400;

/**
 * Run `body` with a document holding an appearance's bytes as one page: the
 * PDF itself, or the image at its own size. It is how every drawn appearance
 * starts, a stamp's drawing and the mark in a signature field alike.
 * `dataPtr` must stay alive until then.
 */
export function withAppearanceDocument<T>(
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
      throw new EngineError(EngineErrorCode.MalformedPdf, 'the appearance PDF could not be opened');
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
 * is a point, scaled down to fit {@link MAX_DRAWING_SIZE}. The page doesn't
 * depend on the box it is drawn into or on a fit, which the appearance that
 * places it applies: a later `fit` shows the whole image, and the same image
 * is always the same page.
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
    throw new EngineError(EngineErrorCode.InvalidArg, 'the appearance image has no size');
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
