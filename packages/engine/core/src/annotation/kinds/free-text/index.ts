import type { FreeTextDraft } from './draft';
import type { FreeTextAnnotationDTO } from './dto';
import type { FreeTextPatch } from './patch';
import { FreeTextDTOSchema, FreeTextDraftSchema, FreeTextPatchSchema } from './schema';
import type { AnnotationKindModule } from '../../registry';
import { PdfAnnotationSubtypeCode } from '../../subtype';

export type { FreeTextAnnotationDTO } from './dto';
export type { FreeTextDraft } from './draft';
export type { FreeTextPatch } from './patch';
export { FreeTextDTOSchema, FreeTextDraftSchema, FreeTextPatchSchema } from './schema';

export const FreeTextKind: AnnotationKindModule<
  'free-text',
  FreeTextAnnotationDTO,
  FreeTextDraft,
  FreeTextPatch
> = {
  subtype: 'free-text',
  pdfSubtypeCode: PdfAnnotationSubtypeCode.FREETEXT,
  dtoSchema: FreeTextDTOSchema,
  draftSchema: FreeTextDraftSchema,
  patchSchema: FreeTextPatchSchema,
};
