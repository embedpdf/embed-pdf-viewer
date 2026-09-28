import type { CreateOf, ReadOf, UpdateOf } from '../../declaration';
import type { Coordinates, PageCoordinates } from '../../../pageSpace/coordinates';
import type { AnnotationKindModule } from '../../registry';
import { PdfAnnotationSubtypeCode } from '../../subtype';
import { StampDeclaration } from './declaration';

export { StampDeclaration } from './declaration';
export { StampFitSchema } from './values';
export type { StampFit } from './values';

export type StampAnnotationDTO<C extends Coordinates = PageCoordinates> = ReadOf<
  typeof StampDeclaration,
  C
>;
/** The drawing travels beside the data, as the `appearance` resource; `fit` says how it fills the box. */
export type StampDraft<C extends Coordinates = PageCoordinates> = CreateOf<
  typeof StampDeclaration,
  C
>;
export type StampPatch<C extends Coordinates = PageCoordinates> = UpdateOf<
  typeof StampDeclaration,
  C
>;

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
    readBackWrites: StampDeclaration.readBackWrites,
  };
