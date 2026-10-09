import type { CreateOf, ReadOf, UpdateOf } from '../../declaration';
import type { Coordinates, PageCoordinates } from '../../../pageSpace/coordinates';
import type { AnnotationKindModule } from '../../registry';
import { PdfAnnotationSubtypeCode } from '../../subtype';
import { PolygonDeclaration } from './declaration';

export { PolygonDeclaration } from './declaration';

export type PolygonAnnotation<C extends Coordinates = PageCoordinates> = ReadOf<
  typeof PolygonDeclaration,
  C
>;
export type PolygonDraft<C extends Coordinates = PageCoordinates> = CreateOf<
  typeof PolygonDeclaration,
  C
>;
export type PolygonPatch<C extends Coordinates = PageCoordinates> = UpdateOf<
  typeof PolygonDeclaration,
  C
>;

export const PolygonDTOSchema = PolygonDeclaration.readSchema;
export const PolygonDraftSchema = PolygonDeclaration.createSchema;
export const PolygonPatchSchema = PolygonDeclaration.updateSchema;

export const PolygonKind: AnnotationKindModule<
  'polygon',
  PolygonAnnotation,
  PolygonDraft,
  PolygonPatch
> = {
  subtype: 'polygon',
  pdfSubtypeCode: PdfAnnotationSubtypeCode.POLYGON,
  dtoSchema: PolygonDTOSchema,
  draftSchema: PolygonDraftSchema,
  patchSchema: PolygonPatchSchema,
  readBackWrites: PolygonDeclaration.readBackWrites,
};
