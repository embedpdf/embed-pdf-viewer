import { CaretIntentSchema } from '../../base.schema';
import { defineKind, field } from '../../declaration';
import { annotationBaseFields, boxFields, colorStyleFields } from '../shared-fields';

export const CaretDeclaration = defineKind('caret', {
  ...annotationBaseFields,
  ...colorStyleFields,
  ...boxFields,
  intent: field.data(CaretIntentSchema).nullable().optional(),
});
