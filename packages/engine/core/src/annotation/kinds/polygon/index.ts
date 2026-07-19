import type { PolygonDraft } from './draft';
import type { PolygonAnnotationDTO } from './dto';
import type { PolygonPatch } from './patch';
import { PolygonDTOSchema, PolygonDraftSchema, PolygonPatchSchema } from './schema';
import type { AnnotationKindModule } from '../../registry';
import { PdfAnnotationSubtypeCode } from '../../subtype';

export type { PolygonAnnotationDTO } from './dto';
export type { PolygonDraft } from './draft';
export type { PolygonPatch } from './patch';
export { PolygonDTOSchema, PolygonDraftSchema, PolygonPatchSchema } from './schema';

export const PolygonKind: AnnotationKindModule<
  'polygon',
  PolygonAnnotationDTO,
  PolygonDraft,
  PolygonPatch
> = {
  subtype: 'polygon',
  pdfSubtypeCode: PdfAnnotationSubtypeCode.POLYGON,
  dtoSchema: PolygonDTOSchema,
  draftSchema: PolygonDraftSchema,
  patchSchema: PolygonPatchSchema,
};
