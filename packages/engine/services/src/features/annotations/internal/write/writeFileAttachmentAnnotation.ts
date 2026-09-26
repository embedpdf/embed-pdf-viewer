import type {
  AttachmentFileInfo,
  Color,
  FileAttachmentDraft,
  FileAttachmentPatch,
} from '@embedpdf/engine-core/runtime';
import { EngineError, EngineErrorCode } from '@embedpdf/engine-core/runtime';
import type { PdfFunctions, PdfRuntimeMemory, Ptr } from '@embedpdf/engine-runtime';

import {
  readAttachmentFileInfo,
  writeAttachmentFilePayload,
} from '../../../attachments/internal/attachmentPrimitives';
import { FILE_ICON_TO_NAME } from '../annotationIcon';
import type { AnnotationWriteContext } from './annotationWriteContext';
import { setAnnotColor, setAnnotOpacity, setAnnotRect } from './annotationWritePrimitives';
import { applyAnnotationBaseDraft, applyAnnotationBasePatch } from './writeAnnotationBase';
import { writeUtf16String } from '../../../../runtime/memory/strings';

/** Default `/C` — the generator's default icon fill, set explicitly so reads round-trip. */
const DEFAULT_FILE_ATTACHMENT_COLOR: Color = { r: 255, g: 255, b: 0 };

const DEFAULT_OPACITY = 1;

/** The file's metadata as a draft or patch carries it. */
type FileMetadata = NonNullable<FileAttachmentDraft['file']>;

/**
 * Validate a file-attachment draft before any native write: the file's
 * bytes must have come with it, as the `file` resource, and its name (the
 * data's, or the one a `File` brought). Any bytes are a valid attachment.
 */
export function preflightFileAttachmentDraft(
  draft: FileAttachmentDraft,
  ctx: AnnotationWriteContext | undefined,
): void {
  requireFileBytes(ctx);
  requireDocPtr(ctx);
  if (!draft.file?.name) {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      "a file attachment needs the file's name: give file.name, or the bytes as a File",
      { details: { field: 'file.name' } },
    );
  }
}

/**
 * Apply a file-attachment draft. Order:
 *   1. base author-metadata (contents/nm/flags)
 *   2. `/Rect` + `/C` + `/CA` + `/Name` icon
 *   3. the embedded file: `/FS` filespec via `FPDFAnnot_AddFileAttachment`,
 *      bytes via `FPDFAttachment_SetFile` (which also writes `/Params`
 *      Size/CheckSum/CreationDate), the MIME type via
 *      `EPDFAttachment_SetSubtype`, optional `/Desc`.
 *
 * The icon appearance itself is generator-owned: the closing appearance pass
 * (`generateAppearance`) bakes it from `/C` + `/Name`
 * (GenerateFileAttachmentAP), exactly like the text note.
 */
export function applyFileAttachmentDraft(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  draft: FileAttachmentDraft,
  ctx: AnnotationWriteContext | undefined,
): void {
  applyAnnotationBaseDraft(fn, mem, annotPtr, draft);
  setAnnotRect(fn, mem, annotPtr, draft.rect);
  setAnnotColor(fn, annotPtr, draft.color ?? DEFAULT_FILE_ATTACHMENT_COLOR);
  setAnnotOpacity(fn, annotPtr, draft.opacity ?? DEFAULT_OPACITY);
  setFileAttachmentIcon(fn, annotPtr, draft.icon ?? 'paperclip');
  // `preflightFileAttachmentDraft` refused a draft without the file's name.
  const file = draft.file!;
  const attachmentPtr = addFileSpec(fn, mem, annotPtr, file.name);
  writeAttachmentFilePayload(fn, mem, attachmentPtr, requireDocPtr(ctx), metadataForPayload(file), {
    bytes: requireFileBytes(ctx),
  });
}

/**
 * Patch the presentation, and the file: `file` replaces its name, MIME type
 * and description, the `file` resource replaces its bytes. Only what differs
 * from the current file is written, so sending a read back changes nothing;
 * the rest of the file specification is kept.
 */
export function applyFileAttachmentPatch(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  patch: FileAttachmentPatch,
  ctx: AnnotationWriteContext | undefined,
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
  writeFileChange(fn, mem, annotPtr, patch.file, ctx);
}

export function isFileAttachmentSubtype(subtype: string): subtype is 'file-attachment' {
  return subtype === 'file-attachment';
}

function writeFileChange(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  metadata: FileMetadata | null | undefined,
  ctx: AnnotationWriteContext | undefined,
): void {
  const bytes = ctx?.resources?.file;
  if (metadata === undefined && bytes === undefined) return;
  if (metadata === null) {
    throw new EngineError(EngineErrorCode.InvalidArg, "a file attachment's file can't be removed");
  }
  let attachmentPtr = fn.FPDFAnnot_GetFileAttachment(annotPtr);
  const current: AttachmentFileInfo | null = attachmentPtr
    ? readAttachmentFileInfo(fn, mem, attachmentPtr)
    : null;
  if (!attachmentPtr) {
    // No file specification yet: writing one needs both the name and the bytes.
    if (!metadata || bytes === undefined) {
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        "the file attachment has no file: send the file's name as `file` and its bytes as the `file` resource",
      );
    }
    attachmentPtr = addFileSpec(fn, mem, annotPtr, metadata.name);
  }

  // The MIME type the file ends with: the data's when it gives one (none if
  // it names none), else the one the file has.
  const mimeType = metadata ? (metadata.mimeType ?? null) : (current?.mimeType ?? null);
  if (bytes !== undefined) {
    // New bytes get a new embedded file stream, without the old one's type.
    writeAttachmentFilePayload(fn, mem, attachmentPtr, requireDocPtr(ctx), { mimeType }, { bytes });
  } else if (mimeType !== (current?.mimeType ?? null)) {
    setMimeType(fn, attachmentPtr, mimeType);
  }

  if (!metadata) return;
  if (current !== null && metadata.name !== current.name) {
    const renamed = writeUtf16String(mem, metadata.name, (ptr) =>
      fn.EPDFAttachment_SetName(attachmentPtr, ptr),
    );
    if (!renamed) {
      throw new EngineError(EngineErrorCode.Unknown, 'EPDFAttachment_SetName returned false');
    }
  }
  if ((metadata.description ?? null) !== (current?.description ?? null)) {
    const described = writeUtf16String(mem, metadata.description ?? '', (ptr) =>
      fn.EPDFAttachment_SetDescription(attachmentPtr, ptr),
    );
    if (!described) {
      throw new EngineError(
        EngineErrorCode.Unknown,
        'EPDFAttachment_SetDescription returned false',
      );
    }
  }
}

/** `/Subtype` of the embedded file stream; `null` removes it. */
function setMimeType(fn: PdfFunctions, attachmentPtr: Ptr, mimeType: string | null): void {
  if (!fn.EPDFAttachment_SetSubtype(attachmentPtr, mimeType ?? '')) {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      "the file attachment's file has no embedded data to give a MIME type",
    );
  }
}

function setFileAttachmentIcon(
  fn: PdfFunctions,
  annotPtr: Ptr,
  icon: keyof typeof FILE_ICON_TO_NAME,
): void {
  if (!fn.EPDFAnnot_SetName(annotPtr, FILE_ICON_TO_NAME[icon])) {
    throw new EngineError(EngineErrorCode.Unknown, 'EPDFAnnot_SetName returned false');
  }
}

/** A new file specification on the annotation, named `name`, replacing any it had. */
function addFileSpec(fn: PdfFunctions, mem: PdfRuntimeMemory, annotPtr: Ptr, name: string): Ptr {
  const namePtr = mem.writeU16String(name);
  let attachmentPtr: Ptr;
  try {
    attachmentPtr = fn.FPDFAnnot_AddFileAttachment(annotPtr, namePtr);
  } finally {
    mem.free(namePtr);
  }
  if (!attachmentPtr) {
    throw new EngineError(EngineErrorCode.Unknown, 'FPDFAnnot_AddFileAttachment returned NULL');
  }
  return attachmentPtr;
}

function metadataForPayload(file: FileMetadata): { mimeType?: string; description?: string } {
  return {
    ...(file.mimeType != null ? { mimeType: file.mimeType } : {}),
    ...(file.description != null ? { description: file.description } : {}),
  };
}

function requireFileBytes(ctx: AnnotationWriteContext | undefined): ArrayBuffer {
  const bytes = ctx?.resources?.file;
  if (bytes === undefined) {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      "creating a file-attachment annotation needs its 'file' resource",
    );
  }
  return bytes;
}

function requireDocPtr(ctx: AnnotationWriteContext | undefined): Ptr {
  if (ctx?.docPtr === undefined) {
    throw new EngineError(
      EngineErrorCode.Unknown,
      'file-attachment writer requires docPtr on the write context',
    );
  }
  return ctx.docPtr;
}
