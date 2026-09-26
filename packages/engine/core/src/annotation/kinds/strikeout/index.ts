import type { CreateOf, ReadOf, UpdateOf } from '../../declaration';
import type { AnnotationKindModule } from '../../registry';
import { PdfAnnotationSubtypeCode } from '../../subtype';
import { StrikeoutDeclaration } from './declaration';

export { StrikeoutDeclaration } from './declaration';

export type StrikeoutAnnotationDTO = ReadOf<typeof StrikeoutDeclaration>;
export type StrikeoutDraft = CreateOf<typeof StrikeoutDeclaration>;
export type StrikeoutPatch = UpdateOf<typeof StrikeoutDeclaration>;

export const StrikeoutDTOSchema = StrikeoutDeclaration.readSchema;
export const StrikeoutDraftSchema = StrikeoutDeclaration.createSchema;
export const StrikeoutPatchSchema = StrikeoutDeclaration.updateSchema;

export const StrikeoutKind: AnnotationKindModule<
  'strikeout',
  StrikeoutAnnotationDTO,
  StrikeoutDraft,
  StrikeoutPatch
> = {
  subtype: 'strikeout',
  pdfSubtypeCode: PdfAnnotationSubtypeCode.STRIKEOUT,
  dtoSchema: StrikeoutDTOSchema,
  draftSchema: StrikeoutDraftSchema,
  patchSchema: StrikeoutPatchSchema,
  readBackWrites: StrikeoutDeclaration.readBackWrites,
};
