import type { CreateOf, ReadOf, UpdateOf } from '../../declaration';
import type { AnnotationKindModule } from '../../registry';
import { PdfAnnotationSubtypeCode } from '../../subtype';
import { PolylineDeclaration } from './declaration';

export { PolylineDeclaration } from './declaration';

export type PolylineAnnotationDTO = ReadOf<typeof PolylineDeclaration>;
export type PolylineDraft = CreateOf<typeof PolylineDeclaration>;
export type PolylinePatch = UpdateOf<typeof PolylineDeclaration>;

export const PolylineDTOSchema = PolylineDeclaration.readSchema;
export const PolylineDraftSchema = PolylineDeclaration.createSchema;
export const PolylinePatchSchema = PolylineDeclaration.updateSchema;

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
