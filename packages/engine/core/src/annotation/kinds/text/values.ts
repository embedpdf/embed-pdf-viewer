import { z } from 'zod';

/** `/Name` icon of a text (sticky note) annotation. */
export type NoteIcon =
  | 'comment'
  | 'key'
  | 'note'
  | 'help'
  | 'new-paragraph'
  | 'paragraph'
  | 'insert';

export const NoteIconSchema: z.ZodType<NoteIcon> = z.enum([
  'comment',
  'key',
  'note',
  'help',
  'new-paragraph',
  'paragraph',
  'insert',
]);
