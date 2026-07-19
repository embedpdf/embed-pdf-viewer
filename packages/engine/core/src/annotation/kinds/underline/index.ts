import type { UnderlineDraft } from './draft';
import type { UnderlineAnnotationDTO } from './dto';
import type { UnderlinePatch } from './patch';
import { UnderlineDTOSchema, UnderlineDraftSchema, UnderlinePatchSchema } from './schema';
import type { AnnotationKindModule } from '../../registry';
import { PdfAnnotationSubtypeCode } from '../../subtype';

export type { UnderlineAnnotationDTO } from './dto';
export type { UnderlineDraft } from './draft';
export type { UnderlinePatch } from './patch';
export { UnderlineDTOSchema, UnderlineDraftSchema, UnderlinePatchSchema } from './schema';

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
