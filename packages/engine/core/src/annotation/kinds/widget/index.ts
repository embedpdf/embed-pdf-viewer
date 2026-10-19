import type { CreateOf, ReadOf, UpdateOf } from '../../declaration';
import type { Coordinates, PageCoordinates } from '../../../pageSpace/coordinates';
import type { AnnotationKindModule } from '../../registry';
import { PdfAnnotationSubtypeCode } from '../../subtype';
import { WidgetDeclaration } from './declaration';

export { WidgetDeclaration } from './declaration';

export type WidgetAnnotation<C extends Coordinates = PageCoordinates> = ReadOf<
  typeof WidgetDeclaration,
  C
>;
export type WidgetDraft<C extends Coordinates = PageCoordinates> = CreateOf<
  typeof WidgetDeclaration,
  C
>;
export type WidgetPatch<C extends Coordinates = PageCoordinates> = UpdateOf<
  typeof WidgetDeclaration,
  C
>;

export const WidgetDTOSchema = WidgetDeclaration.readSchema;
export const WidgetDraftSchema = WidgetDeclaration.createSchema;
export const WidgetPatchSchema = WidgetDeclaration.updateSchema;

export const WidgetKind: AnnotationKindModule<
  'widget',
  WidgetAnnotation,
  WidgetDraft,
  WidgetPatch
> = {
  subtype: 'widget',
  pdfSubtypeCode: PdfAnnotationSubtypeCode.WIDGET,
  dtoSchema: WidgetDTOSchema,
  draftSchema: WidgetDraftSchema,
  patchSchema: WidgetPatchSchema,
  readBackWrites: WidgetDeclaration.readBackWrites,
};
