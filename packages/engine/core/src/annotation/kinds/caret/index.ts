import type { CreateOf, ReadOf, UpdateOf } from '../../declaration';
import type { Coordinates, PageCoordinates } from '../../../pageSpace/coordinates';
import type { AnnotationKindModule } from '../../registry';
import { PdfAnnotationSubtypeCode } from '../../subtype';
import { CaretDeclaration } from './declaration';

export { CaretDeclaration } from './declaration';

export type CaretAnnotation<C extends Coordinates = PageCoordinates> = ReadOf<
  typeof CaretDeclaration,
  C
>;
export type CaretDraft<C extends Coordinates = PageCoordinates> = CreateOf<
  typeof CaretDeclaration,
  C
>;
export type CaretPatch<C extends Coordinates = PageCoordinates> = UpdateOf<
  typeof CaretDeclaration,
  C
>;

export const CaretDTOSchema = CaretDeclaration.readSchema;
export const CaretDraftSchema = CaretDeclaration.createSchema;
export const CaretPatchSchema = CaretDeclaration.updateSchema;

export const CaretKind: AnnotationKindModule<'caret', CaretAnnotation, CaretDraft, CaretPatch> = {
  subtype: 'caret',
  pdfSubtypeCode: PdfAnnotationSubtypeCode.CARET,
  dtoSchema: CaretDTOSchema,
  draftSchema: CaretDraftSchema,
  patchSchema: CaretPatchSchema,
  readBackWrites: CaretDeclaration.readBackWrites,
};
