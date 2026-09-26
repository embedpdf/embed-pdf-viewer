import type { CreateOf, ReadOf, UpdateOf } from '../../declaration';
import type { AnnotationKindModule } from '../../registry';
import { PdfAnnotationSubtypeCode } from '../../subtype';
import { TextDeclaration } from './declaration';

export { TextDeclaration } from './declaration';
export type { NoteIcon } from './values';
export { NoteIconSchema } from './values';

export type TextAnnotationDTO = ReadOf<typeof TextDeclaration>;
export type TextDraft = CreateOf<typeof TextDeclaration>;
export type TextPatch = UpdateOf<typeof TextDeclaration>;

export const TextDTOSchema = TextDeclaration.readSchema;
export const TextDraftSchema = TextDeclaration.createSchema;
export const TextPatchSchema = TextDeclaration.updateSchema;

export const TextKind: AnnotationKindModule<'text', TextAnnotationDTO, TextDraft, TextPatch> = {
  subtype: 'text',
  pdfSubtypeCode: PdfAnnotationSubtypeCode.TEXT,
  dtoSchema: TextDTOSchema,
  draftSchema: TextDraftSchema,
  patchSchema: TextPatchSchema,
  readBackWrites: TextDeclaration.readBackWrites,
};
