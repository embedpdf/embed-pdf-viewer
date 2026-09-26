import type { CreateOf, ReadOf, UpdateOf } from '../../declaration';
import type { AnnotationKindModule } from '../../registry';
import { PdfAnnotationSubtypeCode } from '../../subtype';
import { LineDeclaration } from './declaration';

export { LineDeclaration } from './declaration';

export type LineAnnotationDTO = ReadOf<typeof LineDeclaration>;
export type LineDraft = CreateOf<typeof LineDeclaration>;
export type LinePatch = UpdateOf<typeof LineDeclaration>;

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
