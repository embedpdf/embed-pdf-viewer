import {
  EngineError,
  EngineErrorCode,
  sniffBinaryMetadata,
  type BinaryMetadata,
} from '@embedpdf/engine-core/runtime';
import type { PdfFunctions, PdfRuntimeMemory } from '@embedpdf/engine-runtime';

import { pdfPageCountOf } from './write/stampDrawing';

/**
 * What a picture a field shows is, checked before anything is written: a
 * PNG, a JPEG or a one-page PDF (a mark in a signature field, a push
 * button's image). `declaredPdf` reads the bytes as a PDF and nothing
 * else, as `{ pdf }` asks. Bytes that are none of the three are refused with
 * `InvalidArg`, a PDF that doesn't open with `MalformedPdf`, and one of
 * another page count with `InvalidArg`. `resource` names the bytes in each
 * refusal as the caller passed them (a mark's `appearance`, a button's
 * `image`), and `what` names the picture in the last.
 */
export function pictureFormatOf(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  bytes: ArrayBuffer,
  what: string,
  declaredPdf = false,
  resource = 'appearance',
): BinaryMetadata {
  const format: BinaryMetadata | null = declaredPdf
    ? { mimeType: 'application/pdf' }
    : sniffBinaryMetadata(bytes);
  if (!format) {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      `the ${resource} resource must be PNG, JPEG or one-page PDF bytes`,
    );
  }
  if (format.mimeType !== 'application/pdf') return format;
  const pages = pdfPageCountOf(fn, mem, bytes);
  if (pages === null) {
    throw new EngineError(EngineErrorCode.MalformedPdf, `the ${resource} PDF could not be opened`);
  }
  if (pages !== 1) {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      `the ${resource} PDF has ${pages} pages; ${what} takes a one-page PDF`,
    );
  }
  return format;
}

/** The buffer holding exactly `bytes`: its own when it spans it, else a copy. */
export function exactBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
    ? (bytes.buffer as ArrayBuffer)
    : (bytes.slice().buffer as ArrayBuffer);
}
