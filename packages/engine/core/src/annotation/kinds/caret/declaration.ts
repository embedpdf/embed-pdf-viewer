import { CaretIntentSchema, PdfRectDifferencesSchema } from '../../base.schema';
import { defineKind, field } from '../../declaration';
import { annotationBaseFields, colorStyleFields, rotationFields } from '../shared-fields';

export const CaretDeclaration = defineKind('caret', {
  ...annotationBaseFields,
  ...colorStyleFields,
  ...rotationFields,
  intent: field.data(CaretIntentSchema).nullable().optional(),
  rectDifferences: field.data(PdfRectDifferencesSchema).nullable().optional(),
});
