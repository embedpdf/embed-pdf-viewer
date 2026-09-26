import type { CreateOf, ReadOf, UpdateOf } from '../../declaration';
import type { AnnotationKindModule } from '../../registry';
import { PdfAnnotationSubtypeCode } from '../../subtype';
import { SquigglyDeclaration } from './declaration';

export { SquigglyDeclaration } from './declaration';

export type SquigglyAnnotationDTO = ReadOf<typeof SquigglyDeclaration>;
export type SquigglyDraft = CreateOf<typeof SquigglyDeclaration>;
export type SquigglyPatch = UpdateOf<typeof SquigglyDeclaration>;

export const SquigglyDTOSchema = SquigglyDeclaration.readSchema;
export const SquigglyDraftSchema = SquigglyDeclaration.createSchema;
export const SquigglyPatchSchema = SquigglyDeclaration.updateSchema;

export const SquigglyKind: AnnotationKindModule<
  'squiggly',
  SquigglyAnnotationDTO,
  SquigglyDraft,
  SquigglyPatch
> = {
  subtype: 'squiggly',
  pdfSubtypeCode: PdfAnnotationSubtypeCode.SQUIGGLY,
  dtoSchema: SquigglyDTOSchema,
  draftSchema: SquigglyDraftSchema,
  patchSchema: SquigglyPatchSchema,
  readBackWrites: SquigglyDeclaration.readBackWrites,
};
