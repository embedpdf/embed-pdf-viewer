import type {
  AnnotationBase,
  AttachmentFileInfo,
  Color,
  FileAttachmentAnnotationDTO,
  FileAttachmentIcon,
} from '@embedpdf/engine-core/runtime';
import type { PdfFunctions, PdfRuntimeMemory, Ptr } from '@embedpdf/pdf-runtime';

import { readAttachmentFileInfo } from '../../../attachments/internal/attachmentPrimitives';
import { FILE_CODE_TO_ICON } from '../annotationIcon';
import { readAnnotColor, readAnnotOpacity } from './annotationReadPrimitives';

/** Default `/C` — matches the generator's default icon fill and the writer default. */
const DEFAULT_FILE_ATTACHMENT_COLOR: Color = { r: 255, g: 255, b: 0 };

/** An absent or foreign `/Name` reads as 'push-pin' (ISO 32000 §12.5.6.15 default). */
const DEFAULT_FILE_ATTACHMENT_ICON: FileAttachmentIcon = 'push-pin';

/**
 * FileAttachment DTO: base + icon presentation + the attached file's
 * METADATA (bytes are downloaded explicitly via
 * `PageAnnotationsService.downloadFile`). A malformed annotation without
 * a readable `/FS` filespec still reads — `file.name` is `''` and the
 * download call reports the precise error.
 */
export function readFileAttachment(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  base: AnnotationBase,
): FileAttachmentAnnotationDTO {
  const color = readAnnotColor(fn, mem, annotPtr) ?? { ...DEFAULT_FILE_ATTACHMENT_COLOR };
  const ca = readAnnotOpacity(fn, mem, annotPtr);
  const opacity = ca == null ? 1 : Math.max(0, Math.min(1, ca));
  const icon = FILE_CODE_TO_ICON[fn.EPDFAnnot_GetName(annotPtr)] ?? DEFAULT_FILE_ATTACHMENT_ICON;

  const attachmentPtr = fn.FPDFAnnot_GetFileAttachment(annotPtr);
  const file: AttachmentFileInfo = attachmentPtr
    ? readAttachmentFileInfo(fn, mem, attachmentPtr)
    : { name: '' };

  return {
    ...base,
    subtype: 'file-attachment',
    icon,
    file,
    color,
    opacity,
  };
}
