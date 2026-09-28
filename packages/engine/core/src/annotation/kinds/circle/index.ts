import type { CreateOf, ReadOf, UpdateOf } from '../../declaration';
import type { Coordinates, PageCoordinates } from '../../../pageSpace/coordinates';
import type { AnnotationKindModule } from '../../registry';
import { PdfAnnotationSubtypeCode } from '../../subtype';
import { CircleDeclaration } from './declaration';

export { CircleDeclaration } from './declaration';

export type CircleAnnotationDTO<C extends Coordinates = PageCoordinates> = ReadOf<
  typeof CircleDeclaration,
  C
>;
export type CircleDraft<C extends Coordinates = PageCoordinates> = CreateOf<
  typeof CircleDeclaration,
  C
>;
export type CirclePatch<C extends Coordinates = PageCoordinates> = UpdateOf<
  typeof CircleDeclaration,
  C
>;

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
  readBackWrites: CircleDeclaration.readBackWrites,
};
