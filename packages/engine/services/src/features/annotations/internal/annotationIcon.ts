import type { FileAttachmentIcon, NoteIcon } from '@embedpdf/engine-core/runtime';

/**
 * `/Name` icon vocabulary ↔ PDF name mapping for text and file-attachment
 * annotations (ISO 32000-2 tables 175 and 184). The wire speaks the
 * kebab-case ids; `EPDFAnnot_SetName` / `EPDFAnnot_GetName` speak the PDF
 * names. An unknown PDF name reads as the subtype's default (the reader
 * draws the default glyph for names it does not know — spec behavior).
 */

export const NOTE_ICON_TO_NAME: Readonly<Record<NoteIcon, string>> = Object.freeze({
  comment: 'Comment',
  key: 'Key',
  note: 'Note',
  help: 'Help',
  'new-paragraph': 'NewParagraph',
  paragraph: 'Paragraph',
  insert: 'Insert',
});

export const NOTE_NAME_TO_ICON: Readonly<Record<string, NoteIcon>> = Object.freeze(
  Object.fromEntries(
    Object.entries(NOTE_ICON_TO_NAME).map(([icon, name]) => [name, icon as NoteIcon]),
  ),
);

export const FILE_ICON_TO_NAME: Readonly<Record<FileAttachmentIcon, string>> = Object.freeze({
  graph: 'Graph',
  'push-pin': 'PushPin',
  paperclip: 'Paperclip',
  tag: 'Tag',
});

export const FILE_NAME_TO_ICON: Readonly<Record<string, FileAttachmentIcon>> = Object.freeze(
  Object.fromEntries(
    Object.entries(FILE_ICON_TO_NAME).map(([icon, name]) => [name, icon as FileAttachmentIcon]),
  ),
);
