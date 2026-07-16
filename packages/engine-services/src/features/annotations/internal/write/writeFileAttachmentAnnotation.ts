import type {
  Color,
  FileAttachmentPatch,
  FileAttachmentWireDraft,
  WireAttachmentFile,
  WireResource,
} from '@embedpdf/engine-core/runtime';
import { EngineError, EngineErrorCode } from '@embedpdf/engine-core/runtime';
import type { PdfFunctions, PdfRuntimeMemory, Ptr } from '@embedpdf/pdf-runtime';

import { writeAttachmentFilePayload } from '../../../attachments/internal/attachmentPrimitives';
import { FILE_ICON_TO_CODE } from '../annotationIcon';
import type { AnnotationWriteContext } from './annotationWriteContext';
import { setAnnotColor, setAnnotOpacity, setAnnotRect } from './annotationWritePrimitives';
import { applyAnnotationBaseDraft, applyAnnotationBasePatch } from './writeAnnotationBase';

/** Default `/C` — the generator's default icon fill, set explicitly so reads round-trip. */
const DEFAULT_FILE_ATTACHMENT_COLOR: Color = { r: 255, g: 255, b: 0 };

const DEFAULT_OPACITY = 1;

/**
 * Validate a file-attachment draft before any native write: the wire
 * `file.resource` ref must have arrived with the mutation. No format
 * sniffing — unlike stamps, ANY bytes are a valid attachment.
 */
export function preflightFileAttachmentDraft(
  draft: FileAttachmentWireDraft,
  ctx: AnnotationWriteContext | undefined,
): void {
  requireFileResource(draft.file, ctx);
  if (ctx?.docPtr === undefined) {
    throw new EngineError(
      EngineErrorCode.Unknown,
      'file-attachment writer requires docPtr on the write context',
    );
  }
}

/**
 * Apply a file-attachment draft. Order:
 *   1. base author-metadata (contents/nm/flags)
 *   2. `/Rect` + `/C` + `/CA` + `/Name` icon
 *   3. the embedded file: `/FS` filespec via `FPDFAnnot_AddFileAttachment`,
 *      bytes via `FPDFAttachment_SetFile` (which also writes `/Params`
 *      Size/CheckSum/CreationDate), declared mime via
 *      `EPDFAttachment_SetSubtype`, optional `/Desc`.
 *
 * The icon appearance itself is generator-owned: the mutator's closing
 * `regenerateAppearance` bakes it from `/C` + `/Name`
 * (GenerateFileAttachmentAP), exactly like the text note.
 */
export function applyFileAttachmentDraft(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  draft: FileAttachmentWireDraft,
  ctx: AnnotationWriteContext | undefined,
): void {
  applyAnnotationBaseDraft(fn, mem, annotPtr, draft);
  setAnnotRect(fn, mem, annotPtr, draft.rect);
  setAnnotColor(fn, annotPtr, draft.color ?? DEFAULT_FILE_ATTACHMENT_COLOR);
  setAnnotOpacity(fn, annotPtr, draft.opacity ?? DEFAULT_OPACITY);
  setFileAttachmentIcon(fn, annotPtr, draft.icon ?? 'paperclip');
  attachFile(fn, mem, annotPtr, draft.file, requireFileResource(draft.file, ctx), ctx!.docPtr!);
}

/** Patch: presentation only — the attached file is create-only by design. */
export function applyFileAttachmentPatch(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  patch: FileAttachmentPatch,
): void {
  applyAnnotationBasePatch(fn, mem, annotPtr, patch);
  if (patch.rect !== undefined) {
    setAnnotRect(fn, mem, annotPtr, patch.rect);
  }
  if (patch.color !== undefined) {
    setAnnotColor(fn, annotPtr, patch.color);
  }
  if (patch.opacity !== undefined) {
    setAnnotOpacity(fn, annotPtr, patch.opacity);
  }
  if (patch.icon !== undefined) {
    setFileAttachmentIcon(fn, annotPtr, patch.icon);
  }
}

export function isFileAttachmentSubtype(subtype: string): subtype is 'file-attachment' {
  return subtype === 'file-attachment';
}

function setFileAttachmentIcon(
  fn: PdfFunctions,
  annotPtr: Ptr,
  icon: keyof typeof FILE_ICON_TO_CODE,
): void {
  if (!fn.EPDFAnnot_SetName(annotPtr, FILE_ICON_TO_CODE[icon])) {
    throw new EngineError(EngineErrorCode.Unknown, 'EPDFAnnot_SetName returned false');
  }
}

function requireFileResource(
  file: WireAttachmentFile,
  ctx: AnnotationWriteContext | undefined,
): WireResource {
  const resource = ctx?.resources?.[file.resource];
  if (!resource) {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      `attachment file references resource '${file.resource}' but no such binary payload accompanied the mutation`,
    );
  }
  return resource;
}

function attachFile(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  file: WireAttachmentFile,
  resource: WireResource,
  docPtr: Ptr,
): void {
  const namePtr = mem.writeU16String(file.name);
  let attachmentPtr: Ptr;
  try {
    attachmentPtr = fn.FPDFAnnot_AddFileAttachment(annotPtr, namePtr);
  } finally {
    mem.free(namePtr);
  }
  if (!attachmentPtr) {
    throw new EngineError(EngineErrorCode.Unknown, 'FPDFAnnot_AddFileAttachment returned NULL');
  }

  writeAttachmentFilePayload(fn, mem, attachmentPtr, docPtr, file, resource);
}
