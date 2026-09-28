import { z } from 'zod';

import { defineKind, field } from '../../declaration';
import { annotationBaseFields, colorStyleFields, iconFields } from '../shared-fields';
import { NoteIconSchema } from './values';

export const TextDeclaration = defineKind('text', {
  ...annotationBaseFields,
  ...colorStyleFields,
  ...iconFields,
  icon: field.data(NoteIconSchema).optional(),
  /** `/State`: standard states in lowercase, custom ones as written. */
  state: field.data(z.string().min(1)).nullable().optional(),
  stateModel: field.data(z.string().min(1)).nullable().optional(),
});
