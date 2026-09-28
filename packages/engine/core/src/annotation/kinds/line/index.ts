import type { CreateOf, ReadOf, UpdateOf } from '../../declaration';
import type { Coordinates, PageCoordinates } from '../../../pageSpace/coordinates';
import type { AnnotationKindModule } from '../../registry';
import { PdfAnnotationSubtypeCode } from '../../subtype';
import { LineDeclaration } from './declaration';

export { LineDeclaration } from './declaration';

export type LineAnnotationDTO<C extends Coordinates = PageCoordinates> = ReadOf<
  typeof LineDeclaration,
  C
>;
export type LineDraft<C extends Coordinates = PageCoordinates> = CreateOf<
  typeof LineDeclaration,
  C
>;
export type LinePatch<C extends Coordinates = PageCoordinates> = UpdateOf<
  typeof LineDeclaration,
  C
>;

export const LineDTOSchema = LineDeclaration.readSchema;
export const LineDraftSchema = LineDeclaration.createSchema;
export const LinePatchSchema = LineDeclaration.updateSchema;

export const LineKind: AnnotationKindModule<'line', LineAnnotationDTO, LineDraft, LinePatch> = {
  subtype: 'line',
  pdfSubtypeCode: PdfAnnotationSubtypeCode.LINE,
  dtoSchema: LineDTOSchema,
  draftSchema: LineDraftSchema,
  patchSchema: LinePatchSchema,
  readBackWrites: LineDeclaration.readBackWrites,
};
