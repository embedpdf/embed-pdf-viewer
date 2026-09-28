import type { CreateOf, ReadOf, UpdateOf } from '../../declaration';
import type { Coordinates, PageCoordinates } from '../../../pageSpace/coordinates';
import type { AnnotationKindModule } from '../../registry';
import { PdfAnnotationSubtypeCode } from '../../subtype';
import { TextDeclaration } from './declaration';

export { TextDeclaration } from './declaration';
export type { NoteIcon } from './values';
export { NoteIconSchema } from './values';

export type TextAnnotationDTO<C extends Coordinates = PageCoordinates> = ReadOf<
  typeof TextDeclaration,
  C
>;
export type TextDraft<C extends Coordinates = PageCoordinates> = CreateOf<
  typeof TextDeclaration,
  C
>;
export type TextPatch<C extends Coordinates = PageCoordinates> = UpdateOf<
  typeof TextDeclaration,
  C
>;

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
