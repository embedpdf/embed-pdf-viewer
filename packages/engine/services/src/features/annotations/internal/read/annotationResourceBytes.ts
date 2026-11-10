import { EngineError, EngineErrorCode } from '@embedpdf/engine-core/runtime';
import type { PdfRuntimeModule, Ptr } from '@embedpdf/engine-runtime';

import { exportUnturnedAppearance } from './exportUnturnedAppearance';
import { extractAttachmentToBuffer } from '../../../attachments/internal/attachmentPrimitives';
import { saveDocumentToBuffer } from '../saveDocumentToBuffer';

/**
 * The bytes an annotation carries beside its data, read from its raw handle:
 * what an export puts in a bundle, and what a copy gives its copy without the
 * bytes leaving the engine.
 */

/**
 * An annotation's appearance as a one-page PDF, or `null` without one.
 * `drawing` is the drawing a stamp places (`EPDFAnnot_GetStampDrawing`), or 0:
 * a drawing exports as it is, however many stamps place it; any other
 * appearance exports as the page shows it.
 */
export function appearanceBytesOf(
  runtime: PdfRuntimeModule,
  docPtr: Ptr,
  annotPtr: Ptr,
  drawing: number,
): ArrayBuffer | null {
  const { fn, mem } = runtime;
  const exportedPtr = drawing
    ? fn.EPDFDoc_ExportDrawing(docPtr, drawing)
    : exportUnturnedAppearance(fn, mem, annotPtr);
  if (!exportedPtr) return null;
  try {
    return saveDocumentToBuffer(fn, mem, exportedPtr, 'a drawing').bytes;
  } finally {
    fn.FPDF_CloseDocument(exportedPtr);
  }
}

/**
 * The file a file attachment holds, or `null` without one. `PayloadTooLarge`
 * when it is larger than `maxBytes`.
 */
export function attachedFileBytesOf(
  runtime: PdfRuntimeModule,
  annotPtr: Ptr,
  maxBytes: number,
): ArrayBuffer | null {
  const attachmentPtr = runtime.fn.FPDFAnnot_GetFileAttachment(annotPtr);
  if (!attachmentPtr) return null;
  return extractAttachmentToBuffer(runtime, attachmentPtr, maxBytes).bytes;
}

/** Whether `error` says an attached file is larger than the bytes allowed. */
export function isTooLarge(error: unknown): boolean {
  return EngineError.is(error, EngineErrorCode.PayloadTooLarge);
}
