import type { CreateOf, ReadOf, UpdateOf } from '../../declaration';
import type { Coordinates, PageCoordinates } from '../../../pageSpace/coordinates';
import type { AnnotationKindModule } from '../../registry';
import { PdfAnnotationSubtypeCode } from '../../subtype';
import { HighlightDeclaration } from './declaration';

export { HighlightDeclaration } from './declaration';

export type HighlightAnnotation<C extends Coordinates = PageCoordinates> = ReadOf<
  typeof HighlightDeclaration,
  C
>;
export type HighlightDraft<C extends Coordinates = PageCoordinates> = CreateOf<
  typeof HighlightDeclaration,
  C
>;
export type HighlightPatch<C extends Coordinates = PageCoordinates> = UpdateOf<
  typeof HighlightDeclaration,
  C
>;

export const HighlightDTOSchema = HighlightDeclaration.readSchema;
export const HighlightDraftSchema = HighlightDeclaration.createSchema;
export const HighlightPatchSchema = HighlightDeclaration.updateSchema;

export const HighlightKind: AnnotationKindModule<
  'highlight',
  HighlightAnnotation,
  HighlightDraft,
  HighlightPatch
> = {
  subtype: 'highlight',
  pdfSubtypeCode: PdfAnnotationSubtypeCode.HIGHLIGHT,
  dtoSchema: HighlightDTOSchema,
  draftSchema: HighlightDraftSchema,
  patchSchema: HighlightPatchSchema,
  readBackWrites: HighlightDeclaration.readBackWrites,
};
