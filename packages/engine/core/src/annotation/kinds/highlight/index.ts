import type { HighlightDraft } from './draft';
import type { HighlightAnnotationDTO } from './dto';
import type { HighlightPatch } from './patch';
import { HighlightDTOSchema, HighlightDraftSchema, HighlightPatchSchema } from './schema';
import type { AnnotationKindModule } from '../../registry';
import { PdfAnnotationSubtypeCode } from '../../subtype';

export type { HighlightAnnotationDTO } from './dto';
export type { HighlightDraft } from './draft';
export type { HighlightPatch } from './patch';
export { HighlightDTOSchema, HighlightDraftSchema, HighlightPatchSchema } from './schema';

export const HighlightKind: AnnotationKindModule<
  'highlight',
  HighlightAnnotationDTO,
  HighlightDraft,
  HighlightPatch
> = {
  subtype: 'highlight',
  pdfSubtypeCode: PdfAnnotationSubtypeCode.HIGHLIGHT,
  dtoSchema: HighlightDTOSchema,
  draftSchema: HighlightDraftSchema,
  patchSchema: HighlightPatchSchema,
};
