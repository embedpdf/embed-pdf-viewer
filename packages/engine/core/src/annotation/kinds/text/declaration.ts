import { z } from 'zod';

import { defineKind, field } from '../../declaration';
import { annotationBaseFields, colorStyleFields } from '../shared-fields';
import { NoteIconSchema } from './values';

/** A note: its icon fills `rect`, 20×20 at the usual size. */
export const TextDeclaration = defineKind('text', {
  ...annotationBaseFields,
  ...colorStyleFields,
  icon: field.data(NoteIconSchema).optional(),
  /**
   * `/Open`: whether the note's window shows open. Kept equal to its
   * popup's `open`: a write sets both. `false` when the PDF doesn't say.
   */
  open: field.data(z.boolean()).optional(),
  /** `/State`: standard states in lowercase, custom ones as written. */
  state: field.data(z.string().min(1)).nullable().optional(),
  stateModel: field.data(z.string().min(1)).nullable().optional(),
});
