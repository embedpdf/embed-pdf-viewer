import type { CreateOf, ReadOf, UpdateOf } from '../../declaration';
import type { Coordinates, PageCoordinates } from '../../../pageSpace/coordinates';
import type { AnnotationKindModule } from '../../registry';
import { PdfAnnotationSubtypeCode } from '../../subtype';
import { StrikeoutDeclaration } from './declaration';

export { StrikeoutDeclaration } from './declaration';

export type StrikeoutAnnotationDTO<C extends Coordinates = PageCoordinates> = ReadOf<
  typeof StrikeoutDeclaration,
  C
>;
export type StrikeoutDraft<C extends Coordinates = PageCoordinates> = CreateOf<
  typeof StrikeoutDeclaration,
  C
>;
export type StrikeoutPatch<C extends Coordinates = PageCoordinates> = UpdateOf<
  typeof StrikeoutDeclaration,
  C
>;

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
