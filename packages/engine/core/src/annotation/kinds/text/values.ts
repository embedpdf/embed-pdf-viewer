import { z } from 'zod';

import { closed } from '../../../wire/reading';

/** `/Name` icon of a text (sticky note) annotation. */
export type NoteIcon =
  | 'comment'
  | 'key'
  | 'note'
  | 'help'
  | 'new-paragraph'
  | 'paragraph'
  | 'insert';

export const NoteIconSchema: z.ZodType<NoteIcon> = closed(
  z.enum(['comment', 'key', 'note', 'help', 'new-paragraph', 'paragraph', 'insert']),
);
