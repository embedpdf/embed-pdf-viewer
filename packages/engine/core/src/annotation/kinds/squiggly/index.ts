import type { CreateOf, ReadOf, UpdateOf } from '../../declaration';
import type { Coordinates, PageCoordinates } from '../../../pageSpace/coordinates';
import type { AnnotationKindModule } from '../../registry';
import { PdfAnnotationSubtypeCode } from '../../subtype';
import { SquigglyDeclaration } from './declaration';

export { SquigglyDeclaration } from './declaration';

export type SquigglyAnnotation<C extends Coordinates = PageCoordinates> = ReadOf<
  typeof SquigglyDeclaration,
  C
>;
export type SquigglyDraft<C extends Coordinates = PageCoordinates> = CreateOf<
  typeof SquigglyDeclaration,
  C
>;
export type SquigglyPatch<C extends Coordinates = PageCoordinates> = UpdateOf<
  typeof SquigglyDeclaration,
  C
>;

export const SquigglyDTOSchema = SquigglyDeclaration.readSchema;
export const SquigglyDraftSchema = SquigglyDeclaration.createSchema;
export const SquigglyPatchSchema = SquigglyDeclaration.updateSchema;

export const SquigglyKind: AnnotationKindModule<
  'squiggly',
  SquigglyAnnotation,
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
