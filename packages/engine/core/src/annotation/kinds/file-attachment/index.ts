import type { FileAttachmentWireDraft } from './draft';
import type { FileAttachmentAnnotationDTO } from './dto';
import type { FileAttachmentPatch } from './patch';
import {
  FileAttachmentDTOSchema,
  FileAttachmentPatchSchema,
  FileAttachmentWireDraftSchema,
} from './schema';
import type { AnnotationKindModule } from '../../registry';
import { PdfAnnotationSubtypeCode } from '../../subtype';

export type { FileAttachmentAnnotationDTO } from './dto';
export type {
  FileAttachmentDraft,
  FileAttachmentWireDraft,
  FileAttachmentIcon,
  WireAttachmentFile,
} from './draft';
export type { FileAttachmentPatch } from './patch';
export {
  FileAttachmentDTOSchema,
  FileAttachmentWireDraftSchema,
  FileAttachmentPatchSchema,
  FileAttachmentIconSchema,
  WireAttachmentFileSchema,
} from './schema';
export { normalizeFileAttachmentDraft, normalizeAttachmentFileSource } from './normalize';

/**
 * WIRE-typed like `StampKind`: the draft schema validates the
 * post-normalization form (`file` as metadata + resource ref). The
 * authoring `FileAttachmentDraft` (inline bytes) is swapped into the
 * public `AnnotationDraft` union in `kinds/index.ts`. The patch carries
 * no binary (`file` is create-only), so its authoring and wire forms are
 * the same type.
 */
export const FileAttachmentKind: AnnotationKindModule<
  'file-attachment',
  FileAttachmentAnnotationDTO,
  FileAttachmentWireDraft,
  FileAttachmentPatch
> = {
  subtype: 'file-attachment',
  pdfSubtypeCode: PdfAnnotationSubtypeCode.FILEATTACHMENT,
  dtoSchema: FileAttachmentDTOSchema,
  draftSchema: FileAttachmentWireDraftSchema,
  patchSchema: FileAttachmentPatchSchema,
};
