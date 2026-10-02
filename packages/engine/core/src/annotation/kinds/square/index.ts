import type { CreateOf, ReadOf, UpdateOf } from '../../declaration';
import type { Coordinates, PageCoordinates } from '../../../pageSpace/coordinates';
import type { AnnotationKindModule } from '../../registry';
import { PdfAnnotationSubtypeCode } from '../../subtype';
import { SquareDeclaration } from './declaration';

export { SquareDeclaration } from './declaration';

export type SquareAnnotation<C extends Coordinates = PageCoordinates> = ReadOf<
  typeof SquareDeclaration,
  C
>;
export type SquareDraft<C extends Coordinates = PageCoordinates> = CreateOf<
  typeof SquareDeclaration,
  C
>;
export type SquarePatch<C extends Coordinates = PageCoordinates> = UpdateOf<
  typeof SquareDeclaration,
  C
>;

export const SquareDTOSchema = SquareDeclaration.readSchema;
export const SquareDraftSchema = SquareDeclaration.createSchema;
export const SquarePatchSchema = SquareDeclaration.updateSchema;

export const SquareKind: AnnotationKindModule<
  'square',
  SquareAnnotation,
  SquareDraft,
  SquarePatch
> = {
  subtype: 'square',
  pdfSubtypeCode: PdfAnnotationSubtypeCode.SQUARE,
  dtoSchema: SquareDTOSchema,
  draftSchema: SquareDraftSchema,
  patchSchema: SquarePatchSchema,
  readBackWrites: SquareDeclaration.readBackWrites,
};
