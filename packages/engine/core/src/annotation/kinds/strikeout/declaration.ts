import { StrikeoutIntentSchema } from '../../base.schema';
import { defineKind, field } from '../../declaration';
import { textMarkupFields } from '../shared-fields';

export const StrikeoutDeclaration = defineKind('strikeout', {
  ...textMarkupFields,
  intent: field.data(StrikeoutIntentSchema).nullable().optional(),
});
