import type { AttachmentFileInfo } from '@embedpdf/engine-core/runtime';
import type { PdfFunctions, PdfRuntimeMemory, Ptr } from '@embedpdf/engine-runtime';

import {
  writeAnnotationAuthor,
  writeAnnotationCreated,
  writeAnnotationModified,
} from './writeAnnotationBase';
import { applyEmbedMetadataOnRestore, type RestoredEmbedMetadata } from './writeEmbedMetadata';
import { formatPdfDate } from '../../../../shared/pdf-date';

/** The attribution a restoring import writes: the fields a read returned, as they are. */
export interface RestoredAttribution extends RestoredEmbedMetadata {
  readonly author: string | null;
  readonly createdAt: string | null;
  readonly modifiedAt: string | null;
  /** A file attachment's file: its `/Params` dates. */
  readonly file?: Pick<AttachmentFileInfo, 'createdAt' | 'modifiedAt'> | null;
}

/**
 * Write the attribution an annotation had, instead of stamping the session
 * (convention §2.10): `/T`, `/CreationDate` and `/M` as given, `null` as
 * absent, the dates keeping their offsets; `/EMBD_Metadata` with
 * `importedBy`; and an attached file's dates. It runs last, so `/M` is the
 * date the annotation had, not the time of the import.
 */
export function restoreAttribution(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  from: RestoredAttribution,
  importedBy: string | undefined,
): void {
  if (from.author === null) fn.EPDFAnnot_RemoveKey(annotPtr, 'T');
  else writeAnnotationAuthor(fn, mem, annotPtr, from.author);
  if (from.createdAt === null) fn.EPDFAnnot_RemoveKey(annotPtr, 'CreationDate');
  else writeAnnotationCreated(fn, mem, annotPtr, from.createdAt);
  if (from.modifiedAt === null) fn.EPDFAnnot_RemoveKey(annotPtr, 'M');
  else writeAnnotationModified(fn, mem, annotPtr, from.modifiedAt);
  applyEmbedMetadataOnRestore(fn, mem, annotPtr, from, importedBy);
  if (from.file) restoreFileDates(fn, mem, annotPtr, from.file);
}

// A file's /Params dates. The file was written on create, which dated it
// now; a date the bundle doesn't have stays that one (there is no call to
// remove a /Params entry).
function restoreFileDates(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  file: Pick<AttachmentFileInfo, 'createdAt' | 'modifiedAt'>,
): void {
  const attachmentPtr = fn.FPDFAnnot_GetFileAttachment(annotPtr);
  if (!attachmentPtr) return;
  for (const [key, value] of [
    ['CreationDate', file.createdAt],
    ['ModDate', file.modifiedAt],
  ] as const) {
    if (!value) continue;
    const valuePtr = mem.writeU16String(formatPdfDate(value));
    try {
      fn.FPDFAttachment_SetStringValue(attachmentPtr, key, valuePtr);
    } finally {
      mem.free(valuePtr);
    }
  }
}
