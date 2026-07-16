import type { FileAttachmentIcon, NoteIcon } from '@embedpdf/engine-core/runtime';

/**
 * `/Name` icon ↔ `FPDF_ANNOT_NAME` enum code mapping for text and
 * file-attachment annotations (`EPDFAnnot_SetName` / `EPDFAnnot_GetName`).
 * Codes mirror the `FPDF_ANNOT_NAME` enum in `public/fpdf_annot.h` —
 * same pattern as `stampName.ts` (whose stamp block starts at 13, right
 * after these) keeping engine-core PDFium-free.
 */

export const NOTE_ICON_TO_CODE: Readonly<Record<NoteIcon, number>> = Object.freeze({
  comment: 0,
  key: 1,
  note: 2,
  help: 3,
  'new-paragraph': 4,
  paragraph: 5,
  insert: 6,
});

export const NOTE_CODE_TO_ICON: Readonly<Record<number, NoteIcon>> = Object.freeze(
  Object.fromEntries(
    Object.entries(NOTE_ICON_TO_CODE).map(([icon, code]) => [code, icon as NoteIcon]),
  ),
);

export const FILE_ICON_TO_CODE: Readonly<Record<FileAttachmentIcon, number>> = Object.freeze({
  graph: 7,
  'push-pin': 8,
  paperclip: 9,
  tag: 10,
});

export const FILE_CODE_TO_ICON: Readonly<Record<number, FileAttachmentIcon>> = Object.freeze(
  Object.fromEntries(
    Object.entries(FILE_ICON_TO_CODE).map(([icon, code]) => [code, icon as FileAttachmentIcon]),
  ),
);
