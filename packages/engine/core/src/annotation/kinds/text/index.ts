import type { TextDraft } from './draft';
import type { TextAnnotationDTO } from './dto';
import type { TextPatch } from './patch';
import { TextDTOSchema, TextDraftSchema, TextPatchSchema } from './schema';
import type { AnnotationKindModule } from '../../registry';
import { PdfAnnotationSubtypeCode } from '../../subtype';

export type { TextAnnotationDTO } from './dto';
export type { TextDraft, NoteIcon } from './draft';
export type { TextPatch } from './patch';
export { TextDTOSchema, TextDraftSchema, TextPatchSchema, NoteIconSchema } from './schema';

export const TextKind: AnnotationKindModule<'text', TextAnnotationDTO, TextDraft, TextPatch> = {
  subtype: 'text',
  pdfSubtypeCode: PdfAnnotationSubtypeCode.TEXT,
  dtoSchema: TextDTOSchema,
  draftSchema: TextDraftSchema,
  patchSchema: TextPatchSchema,
};
