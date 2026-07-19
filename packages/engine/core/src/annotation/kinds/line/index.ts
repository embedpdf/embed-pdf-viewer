import type { LineDraft } from './draft';
import type { LineAnnotationDTO } from './dto';
import type { LinePatch } from './patch';
import { LineDTOSchema, LineDraftSchema, LinePatchSchema } from './schema';
import type { AnnotationKindModule } from '../../registry';
import { PdfAnnotationSubtypeCode } from '../../subtype';

export type { LineAnnotationDTO } from './dto';
export type { LineDraft } from './draft';
export type { LinePatch } from './patch';
export { LineDTOSchema, LineDraftSchema, LinePatchSchema } from './schema';

export const LineKind: AnnotationKindModule<'line', LineAnnotationDTO, LineDraft, LinePatch> = {
  subtype: 'line',
  pdfSubtypeCode: PdfAnnotationSubtypeCode.LINE,
  dtoSchema: LineDTOSchema,
  draftSchema: LineDraftSchema,
  patchSchema: LinePatchSchema,
};
