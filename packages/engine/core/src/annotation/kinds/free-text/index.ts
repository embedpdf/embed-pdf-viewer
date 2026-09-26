import type { CreateOf, ReadOf, UpdateOf } from '../../declaration';
import type { AnnotationKindModule } from '../../registry';
import { PdfAnnotationSubtypeCode } from '../../subtype';
import { FreeTextDeclaration } from './declaration';

export { FreeTextDeclaration } from './declaration';
export { RichTextDocumentInputSchema, RichTextDocumentSchema } from './values';

export type FreeTextAnnotationDTO = ReadOf<typeof FreeTextDeclaration>;
export type FreeTextDraft = CreateOf<typeof FreeTextDeclaration>;
export type FreeTextPatch = UpdateOf<typeof FreeTextDeclaration>;

export const FreeTextDTOSchema = FreeTextDeclaration.readSchema;
export const FreeTextDraftSchema = FreeTextDeclaration.createSchema;
export const FreeTextPatchSchema = FreeTextDeclaration.updateSchema;

export const FreeTextKind: AnnotationKindModule<
  'free-text',
  FreeTextAnnotationDTO,
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
