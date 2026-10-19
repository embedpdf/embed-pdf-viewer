import type { CreateOf, ReadOf, UpdateOf } from '../../declaration';
import type { Coordinates, PageCoordinates } from '../../../pageSpace/coordinates';
import type { AnnotationKindModule } from '../../registry';
import { PdfAnnotationSubtypeCode } from '../../subtype';
import { PolylineDeclaration } from './declaration';

export { PolylineDeclaration } from './declaration';

export type PolylineAnnotation<C extends Coordinates = PageCoordinates> = ReadOf<
  typeof PolylineDeclaration,
  C
>;
export type PolylineDraft<C extends Coordinates = PageCoordinates> = CreateOf<
  typeof PolylineDeclaration,
  C
>;
export type PolylinePatch<C extends Coordinates = PageCoordinates> = UpdateOf<
  typeof PolylineDeclaration,
  C
>;

export const PolylineDTOSchema = PolylineDeclaration.readSchema;
export const PolylineDraftSchema = PolylineDeclaration.createSchema;
export const PolylinePatchSchema = PolylineDeclaration.updateSchema;

export const PolylineKind: AnnotationKindModule<
  'polyline',
  PolylineAnnotation,
  PolylineDraft,
  PolylinePatch
> = {
  subtype: 'polyline',
  pdfSubtypeCode: PdfAnnotationSubtypeCode.POLYLINE,
  dtoSchema: PolylineDTOSchema,
  draftSchema: PolylineDraftSchema,
  patchSchema: PolylinePatchSchema,
  readBackWrites: PolylineDeclaration.readBackWrites,
};
