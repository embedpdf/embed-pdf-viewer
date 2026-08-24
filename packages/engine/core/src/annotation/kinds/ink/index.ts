import type { InkDraft } from './draft';
import type { InkAnnotationDTO } from './dto';
import type { InkPatch } from './patch';
import { InkDTOSchema, InkDraftSchema, InkPatchSchema } from './schema';
import type { AnnotationKindModule } from '../../registry';
import { PdfAnnotationSubtypeCode } from '../../subtype';

export type { InkAnnotationDTO } from './dto';
export type { InkDraft } from './draft';
export type { InkPatch } from './patch';
export { InkDTOSchema, InkDraftSchema, InkPatchSchema } from './schema';

export const InkKind: AnnotationKindModule<'ink', InkAnnotationDTO, InkDraft, InkPatch> = {
  subtype: 'ink',
  pdfSubtypeCode: PdfAnnotationSubtypeCode.INK,
  dtoSchema: InkDTOSchema,
  draftSchema: InkDraftSchema,
  patchSchema: InkPatchSchema,
};
