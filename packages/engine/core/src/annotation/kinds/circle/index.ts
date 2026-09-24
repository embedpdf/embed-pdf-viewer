import type { CreateOf, ReadOf, UpdateOf } from '../../declaration';
import type { AnnotationKindModule } from '../../registry';
import { PdfAnnotationSubtypeCode } from '../../subtype';
import { CircleDeclaration } from './declaration';

export { CircleDeclaration } from './declaration';

export type CircleAnnotationDTO = ReadOf<typeof CircleDeclaration>;
export type CircleDraft = CreateOf<typeof CircleDeclaration>;
export type CirclePatch = UpdateOf<typeof CircleDeclaration>;

export const CircleDTOSchema = CircleDeclaration.readSchema;
export const CircleDraftSchema = CircleDeclaration.createSchema;
export const CirclePatchSchema = CircleDeclaration.updateSchema;

export const CircleKind: AnnotationKindModule<
  'circle',
  CircleAnnotationDTO,
  CircleDraft,
  CirclePatch
> = {
  subtype: 'circle',
  pdfSubtypeCode: PdfAnnotationSubtypeCode.CIRCLE,
  dtoSchema: CircleDTOSchema,
  draftSchema: CircleDraftSchema,
  patchSchema: CirclePatchSchema,
};
