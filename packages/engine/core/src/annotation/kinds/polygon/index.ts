import type { CreateOf, ReadOf, UpdateOf } from '../../declaration';
import type { AnnotationKindModule } from '../../registry';
import { PdfAnnotationSubtypeCode } from '../../subtype';
import { PolygonDeclaration } from './declaration';

export { PolygonDeclaration } from './declaration';

export type PolygonAnnotationDTO = ReadOf<typeof PolygonDeclaration>;
export type PolygonDraft = CreateOf<typeof PolygonDeclaration>;
export type PolygonPatch = UpdateOf<typeof PolygonDeclaration>;

export const PolygonDTOSchema = PolygonDeclaration.readSchema;
export const PolygonDraftSchema = PolygonDeclaration.createSchema;
export const PolygonPatchSchema = PolygonDeclaration.updateSchema;

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
  readBackWrites: PolygonDeclaration.readBackWrites,
};
