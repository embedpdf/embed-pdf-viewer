import { z } from 'zod';

/** `/Name` icon of a file attachment annotation (ISO 32000-2 §12.5.6.15). */
export type FileAttachmentIcon = 'push-pin' | 'paperclip' | 'graph' | 'tag';

export const FileAttachmentIconSchema: z.ZodType<FileAttachmentIcon> = z.enum([
  'push-pin',
  'paperclip',
  'graph',
  'tag',
]);

/** The attached file after normalization: its metadata and a resource ref for its bytes. */
export interface WireAttachmentFile {
  resource: string;
  name: string;
  mimeType?: string;
  description?: string;
}

export const WireAttachmentFileSchema: z.ZodType<WireAttachmentFile> = z.object({
  resource: z.string().min(1),
  name: z.string().min(1),
  mimeType: z.string().optional(),
  description: z.string().optional(),
});
