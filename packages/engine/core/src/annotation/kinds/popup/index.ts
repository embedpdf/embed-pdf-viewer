import type { CreateOf, ReadOf, UpdateOf } from '../../declaration';
import type { Coordinates, PageCoordinates } from '../../../pageSpace/coordinates';
import type { AnnotationKindModule } from '../../registry';
import { PdfAnnotationSubtypeCode } from '../../subtype';
import { PopupDeclaration } from './declaration';

export { PopupDeclaration } from './declaration';

export type PopupAnnotation<C extends Coordinates = PageCoordinates> = ReadOf<
  typeof PopupDeclaration,
  C
>;
export type PopupDraft<C extends Coordinates = PageCoordinates> = CreateOf<
  typeof PopupDeclaration,
  C
>;
export type PopupPatch<C extends Coordinates = PageCoordinates> = UpdateOf<
  typeof PopupDeclaration,
  C
>;

export const PopupDTOSchema = PopupDeclaration.readSchema;
export const PopupDraftSchema = PopupDeclaration.createSchema;
export const PopupPatchSchema = PopupDeclaration.updateSchema;

export const PopupKind: AnnotationKindModule<'popup', PopupAnnotation, PopupDraft, PopupPatch> = {
  subtype: 'popup',
  pdfSubtypeCode: PdfAnnotationSubtypeCode.POPUP,
  dtoSchema: PopupDTOSchema,
  draftSchema: PopupDraftSchema,
  patchSchema: PopupPatchSchema,
  readBackWrites: PopupDeclaration.readBackWrites,
};
