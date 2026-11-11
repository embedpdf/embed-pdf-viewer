import type { DocumentFileInfo, DocumentPageMode } from '@embedpdf/engine-core/runtime';
import {
  NULL_PTR,
  type PdfFunctions,
  type PdfRuntimeMemory,
  type Ptr,
} from '@embedpdf/engine-runtime';

import { readMetaText } from './readMetadataText';
import { readXmpPacket } from './xmp/xmpPacket';
import { withScratch } from '../../../runtime/memory/scratch';
import { I32_BYTES, readI32 } from '../../../runtime/memory/structs';
import { readUtf16String, readUtf8String } from '../../../runtime/memory/strings';

/** `FPDFDoc_GetPageMode` codes (public/fpdf_ext.h). */
const PAGE_MODES: Record<number, DocumentPageMode> = {
  0: 'none',
  1: 'outlines',
  2: 'thumbnails',
  3: 'fullScreen',
  4: 'optionalContent',
  5: 'attachments',
};

/** `FPDF_FILEIDTYPE`. */
const FILEID_PERMANENT = 0;
const FILEID_CHANGING = 1;

/** The header's version: `FPDF_GetFileVersion` reads 17 for `%PDF-1.7`. */
function readVersion(fn: PdfFunctions, mem: PdfRuntimeMemory, docPtr: Ptr): string | null {
  return withScratch(mem, I32_BYTES, (ptr) => {
    if (!fn.FPDF_GetFileVersion(docPtr, ptr)) return null;
    const v = readI32(mem, ptr);
    return v > 0 ? `${Math.floor(v / 10)}.${v % 10}` : null;
  });
}

/** One `/ID` string as lowercase hex; `null` when the trailer has none. */
function readIdentifier(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  docPtr: Ptr,
  type: number,
): string | null {
  // The byte length plus a trailing NUL.
  const len = fn.FPDF_GetFileIdentifier(docPtr, type, NULL_PTR, 0);
  if (len <= 1) return null;
  const bytes = withScratch(mem, len, (buf) =>
    fn.FPDF_GetFileIdentifier(docPtr, type, buf, len) === len ? mem.readBytes(buf, len - 1) : null,
  );
  return bytes ? Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('') : null;
}

/** Every key of the Info dictionary, standard and custom, and its text as written. */
function readInfo(fn: PdfFunctions, mem: PdfRuntimeMemory, docPtr: Ptr): Record<string, string> {
  const count = Number(fn.EPDF_GetMetaKeyCount(docPtr, false)) | 0;
  const info: Record<string, string> = {};
  for (let i = 0; i < count; i++) {
    const key = readUtf8String(mem, (buf, capacity) =>
      fn.EPDF_GetMetaKeyName(docPtr, i, false, buf, capacity),
    );
    if (!key) continue;
    const value = readMetaText(fn, mem, docPtr, key);
    if (value != null) info[key] = value;
  }
  return info;
}

/** Header, trailer and catalog facts; dictionary reads only, no page is loaded. */
export function readFileInfo(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  docPtr: Ptr,
): DocumentFileInfo {
  const permanent = readIdentifier(fn, mem, docPtr, FILEID_PERMANENT);
  const changing = readIdentifier(fn, mem, docPtr, FILEID_CHANGING);
  return {
    version: readVersion(fn, mem, docPtr),
    identifiers: permanent !== null && changing !== null ? { permanent, changing } : null,
    language: readUtf16String(
      mem,
      (buf, capacity) => fn.FPDFCatalog_GetLanguage(docPtr, buf, capacity),
      null,
    ),
    pageMode: PAGE_MODES[fn.FPDFDoc_GetPageMode(docPtr)] ?? 'none',
    xmp: readXmpPacket(fn, mem, docPtr)?.text ?? null,
    info: readInfo(fn, mem, docPtr),
  };
}
