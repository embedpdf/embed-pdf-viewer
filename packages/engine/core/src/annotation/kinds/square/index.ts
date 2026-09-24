import type { CreateOf, ReadOf, UpdateOf } from '../../declaration';
import type { AnnotationKindModule } from '../../registry';
import { PdfAnnotationSubtypeCode } from '../../subtype';
import { SquareDeclaration } from './declaration';

export { SquareDeclaration } from './declaration';

export type SquareAnnotationDTO = ReadOf<typeof SquareDeclaration>;
export type SquareDraft = CreateOf<typeof SquareDeclaration>;
export type SquarePatch = UpdateOf<typeof SquareDeclaration>;

export const SquareDTOSchema = SquareDeclaration.readSchema;
export const SquareDraftSchema = SquareDeclaration.createSchema;
export const SquarePatchSchema = SquareDeclaration.updateSchema;

export const SquareKind: AnnotationKindModule<
  'square',
  SquareAnnotationDTO,
  SquareDraft,
  SquarePatch
> = {
  subtype: 'square',
  pdfSubtypeCode: PdfAnnotationSubtypeCode.SQUARE,
  dtoSchema: SquareDTOSchema,
  draftSchema: SquareDraftSchema,
  patchSchema: SquarePatchSchema,
};
