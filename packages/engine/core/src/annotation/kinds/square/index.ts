import type { SquareDraft } from './draft';
import type { SquareAnnotationDTO } from './dto';
import type { SquarePatch } from './patch';
import { SquareDTOSchema, SquareDraftSchema, SquarePatchSchema } from './schema';
import type { AnnotationKindModule } from '../../registry';
import { PdfAnnotationSubtypeCode } from '../../subtype';

export type { SquareAnnotationDTO } from './dto';
export type { SquareDraft } from './draft';
export type { SquarePatch } from './patch';
export { SquareDTOSchema, SquareDraftSchema, SquarePatchSchema } from './schema';

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
