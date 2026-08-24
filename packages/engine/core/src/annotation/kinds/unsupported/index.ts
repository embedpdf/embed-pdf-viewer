import type { UnsupportedAnnotationDTO } from './dto';
import { UnsupportedDTOSchema, UnsupportedDraftSchema, UnsupportedPatchSchema } from './schema';
import type { AnnotationKindModule } from '../../registry';
import { PdfAnnotationSubtypeCode } from '../../subtype';

export type { UnsupportedAnnotationDTO } from './dto';
export type { UnsupportedDraft } from './draft';
export type { UnsupportedPatch } from './patch';
export { UnsupportedDTOSchema, UnsupportedDraftSchema, UnsupportedPatchSchema } from './schema';

export const UnsupportedKind: AnnotationKindModule<
  'unsupported',
  UnsupportedAnnotationDTO,
  never,
  never
> = {
  subtype: 'unsupported',
  pdfSubtypeCode: PdfAnnotationSubtypeCode.UNKNOWN,
  dtoSchema: UnsupportedDTOSchema,
  draftSchema: UnsupportedDraftSchema,
  patchSchema: UnsupportedPatchSchema,
};
