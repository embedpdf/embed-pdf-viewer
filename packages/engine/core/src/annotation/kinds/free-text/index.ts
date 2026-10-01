import type { CreateOf, ReadOf, UpdateOf } from '../../declaration';
import type { Coordinates, PageCoordinates } from '../../../pageSpace/coordinates';
import type { AnnotationKindModule } from '../../registry';
import { PdfAnnotationSubtypeCode } from '../../subtype';
import { FreeTextDeclaration } from './declaration';

export { FreeTextDeclaration } from './declaration';
export { RichTextDocumentInputSchema, RichTextDocumentSchema } from './values';

export type FreeTextAnnotation<C extends Coordinates = PageCoordinates> = ReadOf<
  typeof FreeTextDeclaration,
  C
>;
export type FreeTextDraft<C extends Coordinates = PageCoordinates> = CreateOf<
  typeof FreeTextDeclaration,
  C
>;
export type FreeTextPatch<C extends Coordinates = PageCoordinates> = UpdateOf<
  typeof FreeTextDeclaration,
  C
>;

export const FreeTextDTOSchema = FreeTextDeclaration.readSchema;
export const FreeTextDraftSchema = FreeTextDeclaration.createSchema;
export const FreeTextPatchSchema = FreeTextDeclaration.updateSchema;

export const FreeTextKind: AnnotationKindModule<
  'free-text',
  FreeTextAnnotation,
  FreeTextDraft,
  FreeTextPatch
> = {
  subtype: 'free-text',
  pdfSubtypeCode: PdfAnnotationSubtypeCode.FREETEXT,
  dtoSchema: FreeTextDTOSchema,
  draftSchema: FreeTextDraftSchema,
  patchSchema: FreeTextPatchSchema,
  readBackWrites: FreeTextDeclaration.readBackWrites,
};
