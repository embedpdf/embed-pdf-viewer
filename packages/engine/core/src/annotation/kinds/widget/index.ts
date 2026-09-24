import type { CreateOf, ReadOf, UpdateOf } from '../../declaration';
import type { AnnotationKindModule } from '../../registry';
import { PdfAnnotationSubtypeCode } from '../../subtype';
import { WidgetDeclaration } from './declaration';

export { WidgetDeclaration } from './declaration';

export type WidgetAnnotationDTO = ReadOf<typeof WidgetDeclaration>;
export type WidgetDraft = CreateOf<typeof WidgetDeclaration>;
export type WidgetPatch = UpdateOf<typeof WidgetDeclaration>;

export const WidgetDTOSchema = WidgetDeclaration.readSchema;
export const WidgetDraftSchema = WidgetDeclaration.createSchema;
export const WidgetPatchSchema = WidgetDeclaration.updateSchema;

export const WidgetKind: AnnotationKindModule<
  'widget',
  WidgetAnnotationDTO,
  WidgetDraft,
  WidgetPatch
> = {
  subtype: 'widget',
  pdfSubtypeCode: PdfAnnotationSubtypeCode.WIDGET,
  dtoSchema: WidgetDTOSchema,
  draftSchema: WidgetDraftSchema,
  patchSchema: WidgetPatchSchema,
};
