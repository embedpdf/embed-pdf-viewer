import { z } from 'zod';

import type { AttachmentFileSource } from '../../../dto/Attachment';
import type { CreateOf, ReadOf, UpdateOf } from '../../declaration';
import type { AnnotationKindModule } from '../../registry';
import { PdfAnnotationSubtypeCode } from '../../subtype';
import { FileAttachmentDeclaration } from './declaration';
import { WireAttachmentFileSchema, type WireAttachmentFile } from './values';

export { FileAttachmentDeclaration } from './declaration';
export { FileAttachmentIconSchema, WireAttachmentFileSchema } from './values';
export type { FileAttachmentIcon, WireAttachmentFile } from './values';

export type FileAttachmentAnnotationDTO = ReadOf<typeof FileAttachmentDeclaration>;

/** The draft carries the file's bytes with its metadata. */
export type FileAttachmentDraft = Omit<CreateOf<typeof FileAttachmentDeclaration>, 'file'> & {
  file: AttachmentFileSource;
};
export type FileAttachmentWireDraft = Omit<CreateOf<typeof FileAttachmentDeclaration>, 'file'> & {
  file: WireAttachmentFile;
};
/** `file` in an update may only repeat the current metadata: the attached file can't change after create. */
export type FileAttachmentPatch = UpdateOf<typeof FileAttachmentDeclaration>;

const { file: _createFile, ...createShape } = FileAttachmentDeclaration.shapes.create;

export const FileAttachmentDTOSchema = FileAttachmentDeclaration.readSchema;
export const FileAttachmentWireDraftSchema = z
  .object({ ...createShape, file: WireAttachmentFileSchema })
  .strict() as unknown as z.ZodType<FileAttachmentWireDraft>;
export const FileAttachmentPatchSchema = FileAttachmentDeclaration.updateSchema;

/**
 * Wire-typed like `StampKind`: the draft schema validates the form after
 * normalization, with `file` as metadata and a resource ref.
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

export { normalizeFileAttachmentDraft, normalizeAttachmentFileSource } from './normalize';
