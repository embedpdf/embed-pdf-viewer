import type { CreateOf, ReadOf, UpdateOf } from '../../declaration';
import type { AnnotationKindModule } from '../../registry';
import { PdfAnnotationSubtypeCode } from '../../subtype';
import { UnderlineDeclaration } from './declaration';

export { UnderlineDeclaration } from './declaration';

export type UnderlineAnnotationDTO = ReadOf<typeof UnderlineDeclaration>;
export type UnderlineDraft = CreateOf<typeof UnderlineDeclaration>;
export type UnderlinePatch = UpdateOf<typeof UnderlineDeclaration>;

export const UnderlineDTOSchema = UnderlineDeclaration.readSchema;
export const UnderlineDraftSchema = UnderlineDeclaration.createSchema;
export const UnderlinePatchSchema = UnderlineDeclaration.updateSchema;

export const UnderlineKind: AnnotationKindModule<
  'underline',
  UnderlineAnnotationDTO,
  UnderlineDraft,
  UnderlinePatch
> = {
  subtype: 'underline',
  pdfSubtypeCode: PdfAnnotationSubtypeCode.UNDERLINE,
  dtoSchema: UnderlineDTOSchema,
  draftSchema: UnderlineDraftSchema,
  patchSchema: UnderlinePatchSchema,
};
