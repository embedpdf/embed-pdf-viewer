import type { CreateOf, ReadOf, UpdateOf } from '../../declaration';
import type { Coordinates, PageCoordinates } from '../../../pageSpace/coordinates';
import type { AnnotationKindModule } from '../../registry';
import { PdfAnnotationSubtypeCode } from '../../subtype';
import { InkDeclaration } from './declaration';

export { InkDeclaration } from './declaration';

export type InkAnnotation<C extends Coordinates = PageCoordinates> = ReadOf<
  typeof InkDeclaration,
  C
>;
export type InkDraft<C extends Coordinates = PageCoordinates> = CreateOf<typeof InkDeclaration, C>;
export type InkPatch<C extends Coordinates = PageCoordinates> = UpdateOf<typeof InkDeclaration, C>;

export const InkDTOSchema = InkDeclaration.readSchema;
export const InkDraftSchema = InkDeclaration.createSchema;
export const InkPatchSchema = InkDeclaration.updateSchema;

export const InkKind: AnnotationKindModule<'ink', InkAnnotation, InkDraft, InkPatch> = {
  subtype: 'ink',
  pdfSubtypeCode: PdfAnnotationSubtypeCode.INK,
  dtoSchema: InkDTOSchema,
  draftSchema: InkDraftSchema,
  patchSchema: InkPatchSchema,
  readBackWrites: InkDeclaration.readBackWrites,
};
