import type { CreateOf, ReadOf, UpdateOf } from '../../declaration';
import type { AnnotationKindModule } from '../../registry';
import { PdfAnnotationSubtypeCode } from '../../subtype';
import { StampDeclaration } from './declaration';

export { StampDeclaration } from './declaration';
export { StampFitSchema } from './values';
export type { StampFit } from './values';

export type StampAnnotationDTO = ReadOf<typeof StampDeclaration>;
/** The drawing travels beside the data, as the `appearance` resource; `fit` says how it fills the box. */
export type StampDraft = CreateOf<typeof StampDeclaration>;
export type StampPatch = UpdateOf<typeof StampDeclaration>;

export const StampDTOSchema = StampDeclaration.readSchema;
export const StampDraftSchema = StampDeclaration.createSchema;
export const StampPatchSchema = StampDeclaration.updateSchema;

export const StampKind: AnnotationKindModule<'stamp', StampAnnotationDTO, StampDraft, StampPatch> =
  {
    subtype: 'stamp',
    pdfSubtypeCode: PdfAnnotationSubtypeCode.STAMP,
    dtoSchema: StampDTOSchema,
    draftSchema: StampDraftSchema,
    patchSchema: StampPatchSchema,
  };
