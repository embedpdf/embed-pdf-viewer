import type { CircleDraft } from './draft';
import type { CircleAnnotationDTO } from './dto';
import type { CirclePatch } from './patch';
import { CircleDTOSchema, CircleDraftSchema, CirclePatchSchema } from './schema';
import type { AnnotationKindModule } from '../../registry';
import { PdfAnnotationSubtypeCode } from '../../subtype';

export type { CircleAnnotationDTO } from './dto';
export type { CircleDraft } from './draft';
export type { CirclePatch } from './patch';
export { CircleDTOSchema, CircleDraftSchema, CirclePatchSchema } from './schema';

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
