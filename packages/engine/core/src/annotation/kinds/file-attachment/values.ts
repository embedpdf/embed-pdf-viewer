import { z } from 'zod';

/** `/Name` icon of a file attachment annotation (ISO 32000-2 §12.5.6.15). */
export type FileAttachmentIcon = 'push-pin' | 'paperclip' | 'graph' | 'tag';

export const FileAttachmentIconSchema: z.ZodType<FileAttachmentIcon> = z.enum([
  'push-pin',
  'paperclip',
  'graph',
  'tag',
]);
