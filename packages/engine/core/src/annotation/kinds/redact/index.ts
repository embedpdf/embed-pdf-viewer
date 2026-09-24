import type { CreateOf, ReadOf, UpdateOf } from '../../declaration';
import type { AnnotationKindModule } from '../../registry';
import { PdfAnnotationSubtypeCode } from '../../subtype';
import { RedactDeclaration } from './declaration';

export { RedactDeclaration } from './declaration';

export type RedactAnnotationDTO = ReadOf<typeof RedactDeclaration>;
export type RedactDraft = CreateOf<typeof RedactDeclaration>;
export type RedactPatch = UpdateOf<typeof RedactDeclaration>;

export const RedactDTOSchema = RedactDeclaration.readSchema;
export const RedactDraftSchema = RedactDeclaration.createSchema;
export const RedactPatchSchema = RedactDeclaration.updateSchema;

export const RedactKind: AnnotationKindModule<
  'redact',
  RedactAnnotationDTO,
  RedactDraft,
  RedactPatch
> = {
  subtype: 'redact',
  pdfSubtypeCode: PdfAnnotationSubtypeCode.REDACT,
  dtoSchema: RedactDTOSchema,
  draftSchema: RedactDraftSchema,
  patchSchema: RedactPatchSchema,
};
