import * as z from '../../../zod';
import type { CreateOf, ReadOf, UpdateOf } from '../../declaration';
import type { Coordinates, PageCoordinates } from '../../../pageSpace/coordinates';
import type { AnnotationKindModule } from '../../registry';
import { PdfAnnotationSubtypeCode } from '../../subtype';
import { WidgetDeclaration } from './declaration';
import { withWidgetLayout } from './layout';

export { WidgetDeclaration } from './declaration';
export { withWidgetLayout } from './layout';

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

/**
 * A widget row as the wire reads it: an older side's row, without `layout`,
 * is made whole first (`withWidgetLayout`). The contract writes it as the
 * row itself, `WidgetAnnotation`, with `layout` required.
 */
export const WidgetDTOSchema = z.preprocess(
  (value) =>
    typeof value === 'object' && value !== null && !Array.isArray(value)
      ? withWidgetLayout(value as Record<string, unknown>)
      : value,
  WidgetDeclaration.readSchema,
);
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
  // The row itself: an annotation union reads an older side's row whole first (`AnnotationSchema`).
  dtoSchema: WidgetDeclaration.readSchema,
  draftSchema: WidgetDraftSchema,
  patchSchema: WidgetPatchSchema,
  readBackWrites: WidgetDeclaration.readBackWrites,
};
