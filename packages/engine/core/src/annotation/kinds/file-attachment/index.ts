import type { CreateOf, ReadOf, UpdateOf } from '../../declaration';
import type { Coordinates, PageCoordinates } from '../../../pageSpace/coordinates';
import type { AnnotationKindModule } from '../../registry';
import { PdfAnnotationSubtypeCode } from '../../subtype';
import { FileAttachmentDeclaration } from './declaration';

export { FileAttachmentDeclaration } from './declaration';
export { FileAttachmentIconSchema } from './values';
export type { FileAttachmentIcon } from './values';

export type FileAttachmentAnnotation<C extends Coordinates = PageCoordinates> = ReadOf<
  typeof FileAttachmentDeclaration,
  C
>;
/**
 * `file` is the file's name, MIME type and description; its bytes travel
 * beside the data, as the `file` resource. In an update, `file` replaces all
 * three, and the `file` resource replaces the bytes.
 */
export type FileAttachmentDraft<C extends Coordinates = PageCoordinates> = CreateOf<
  typeof FileAttachmentDeclaration,
  C
>;
export type FileAttachmentPatch<C extends Coordinates = PageCoordinates> = UpdateOf<
  typeof FileAttachmentDeclaration,
  C
>;

export const FileAttachmentDTOSchema = FileAttachmentDeclaration.readSchema;
export const FileAttachmentDraftSchema = FileAttachmentDeclaration.createSchema;
export const FileAttachmentPatchSchema = FileAttachmentDeclaration.updateSchema;

export const FileAttachmentKind: AnnotationKindModule<
  'file-attachment',
  FileAttachmentAnnotation,
  FileAttachmentDraft,
  FileAttachmentPatch
> = {
  subtype: 'file-attachment',
  pdfSubtypeCode: PdfAnnotationSubtypeCode.FILEATTACHMENT,
  dtoSchema: FileAttachmentDTOSchema,
  draftSchema: FileAttachmentDraftSchema,
  patchSchema: FileAttachmentPatchSchema,
  readBackWrites: FileAttachmentDeclaration.readBackWrites,
};
