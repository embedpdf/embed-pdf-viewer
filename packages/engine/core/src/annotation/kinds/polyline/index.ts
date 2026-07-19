import type { PolylineDraft } from './draft';
import type { PolylineAnnotationDTO } from './dto';
import type { PolylinePatch } from './patch';
import { PolylineDTOSchema, PolylineDraftSchema, PolylinePatchSchema } from './schema';
import type { AnnotationKindModule } from '../../registry';
import { PdfAnnotationSubtypeCode } from '../../subtype';

export type { PolylineAnnotationDTO } from './dto';
export type { PolylineDraft } from './draft';
export type { PolylinePatch } from './patch';
export { PolylineDTOSchema, PolylineDraftSchema, PolylinePatchSchema } from './schema';

export const PolylineKind: AnnotationKindModule<
  'polyline',
  PolylineAnnotationDTO,
  PolylineDraft,
  PolylinePatch
> = {
  subtype: 'polyline',
  pdfSubtypeCode: PdfAnnotationSubtypeCode.POLYLINE,
  dtoSchema: PolylineDTOSchema,
  draftSchema: PolylineDraftSchema,
  patchSchema: PolylinePatchSchema,
};
