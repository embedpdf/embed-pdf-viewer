import type { SquigglyDraft } from './draft';
import type { SquigglyAnnotationDTO } from './dto';
import type { SquigglyPatch } from './patch';
import { SquigglyDTOSchema, SquigglyDraftSchema, SquigglyPatchSchema } from './schema';
import type { AnnotationKindModule } from '../../registry';
import { PdfAnnotationSubtypeCode } from '../../subtype';

export type { SquigglyAnnotationDTO } from './dto';
export type { SquigglyDraft } from './draft';
export type { SquigglyPatch } from './patch';
export { SquigglyDTOSchema, SquigglyDraftSchema, SquigglyPatchSchema } from './schema';

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
};
