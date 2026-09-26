import type { CreateOf, ReadOf, UpdateOf } from '../../declaration';
import type { AnnotationKindModule } from '../../registry';
import { PdfAnnotationSubtypeCode } from '../../subtype';
import { PopupDeclaration } from './declaration';

export { PopupDeclaration } from './declaration';

export type PopupAnnotationDTO = ReadOf<typeof PopupDeclaration>;
export type PopupDraft = CreateOf<typeof PopupDeclaration>;
export type PopupPatch = UpdateOf<typeof PopupDeclaration>;

export const PopupDTOSchema = PopupDeclaration.readSchema;
export const PopupDraftSchema = PopupDeclaration.createSchema;
export const PopupPatchSchema = PopupDeclaration.updateSchema;

export const PopupKind: AnnotationKindModule<'popup', PopupAnnotationDTO, PopupDraft, PopupPatch> =
  {
    subtype: 'popup',
    pdfSubtypeCode: PdfAnnotationSubtypeCode.POPUP,
    dtoSchema: PopupDTOSchema,
    draftSchema: PopupDraftSchema,
    patchSchema: PopupPatchSchema,
    readBackWrites: PopupDeclaration.readBackWrites,
  };
