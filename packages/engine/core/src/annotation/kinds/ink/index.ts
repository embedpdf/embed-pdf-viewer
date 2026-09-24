import type { CreateOf, ReadOf, UpdateOf } from '../../declaration';
import type { AnnotationKindModule } from '../../registry';
import { PdfAnnotationSubtypeCode } from '../../subtype';
import { InkDeclaration } from './declaration';

export { InkDeclaration } from './declaration';

export type InkAnnotationDTO = ReadOf<typeof InkDeclaration>;
export type InkDraft = CreateOf<typeof InkDeclaration>;
export type InkPatch = UpdateOf<typeof InkDeclaration>;

export const InkDTOSchema = InkDeclaration.readSchema;
export const InkDraftSchema = InkDeclaration.createSchema;
export const InkPatchSchema = InkDeclaration.updateSchema;

export const InkKind: AnnotationKindModule<'ink', InkAnnotationDTO, InkDraft, InkPatch> = {
  subtype: 'ink',
  pdfSubtypeCode: PdfAnnotationSubtypeCode.INK,
  dtoSchema: InkDTOSchema,
  draftSchema: InkDraftSchema,
  patchSchema: InkPatchSchema,
};
