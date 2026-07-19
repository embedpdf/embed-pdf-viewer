import type { AnnotationKindModule } from '../../registry';
import { PdfAnnotationSubtypeCode } from '../../subtype';
import type { WidgetDraft } from './draft';
import type { WidgetAnnotationDTO } from './dto';
import type { WidgetPatch } from './patch';
import { WidgetDTOSchema, WidgetDraftSchema, WidgetPatchSchema } from './schema';

export type { WidgetAnnotationDTO } from './dto';
export type { WidgetDraft } from './draft';
export type { WidgetPatch } from './patch';
export { WidgetDTOSchema, WidgetDraftSchema, WidgetPatchSchema } from './schema';

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
