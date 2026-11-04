import { CaretIntentSchema } from '../../base.schema';
import { defineKind, field } from '../../declaration';
import { markupBaseFields, boxFields, colorStyleFields } from '../shared-fields';

export const CaretDeclaration = defineKind('caret', {
  ...markupBaseFields,
  ...colorStyleFields,
  ...boxFields,
  intent: field.data(CaretIntentSchema).nullable().optional(),
});
