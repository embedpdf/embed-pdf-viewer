import type { CreateOf, ReadOf, UpdateOf } from '../../declaration';
import type { Coordinates, PageCoordinates } from '../../../pageSpace/coordinates';
import type { AnnotationKindModule } from '../../registry';
import { PdfAnnotationSubtypeCode } from '../../subtype';
import { UnderlineDeclaration } from './declaration';

export { UnderlineDeclaration } from './declaration';

export type UnderlineAnnotation<C extends Coordinates = PageCoordinates> = ReadOf<
  typeof UnderlineDeclaration,
  C
>;
export type UnderlineDraft<C extends Coordinates = PageCoordinates> = CreateOf<
  typeof UnderlineDeclaration,
  C
>;
export type UnderlinePatch<C extends Coordinates = PageCoordinates> = UpdateOf<
  typeof UnderlineDeclaration,
  C
>;

export const UnderlineDTOSchema = UnderlineDeclaration.readSchema;
export const UnderlineDraftSchema = UnderlineDeclaration.createSchema;
export const UnderlinePatchSchema = UnderlineDeclaration.updateSchema;

export const UnderlineKind: AnnotationKindModule<
  'underline',
  UnderlineAnnotation,
  UnderlineDraft,
  UnderlinePatch
> = {
  subtype: 'underline',
  pdfSubtypeCode: PdfAnnotationSubtypeCode.UNDERLINE,
  dtoSchema: UnderlineDTOSchema,
  draftSchema: UnderlineDraftSchema,
  patchSchema: UnderlinePatchSchema,
  readBackWrites: UnderlineDeclaration.readBackWrites,
};
