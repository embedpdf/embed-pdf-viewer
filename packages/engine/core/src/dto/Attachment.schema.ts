import { z } from 'zod';

import type { AttachmentFileInfo, EmbeddedFileItem, EmbeddedFileRef } from './Attachment';

/**
 * Wire schemas for the attachment read vocabulary (see `Attachment.ts`).
 * The write-side `AttachmentFileSource` carries inline bytes and never
 * appears on the wire — its post-normalization form is the kind-owned
 * `WireAttachmentFile` (see `annotation/kinds/file-attachment/schema.ts`).
 */

export const AttachmentFileInfoSchema: z.ZodType<AttachmentFileInfo> = z.object({
  name: z.string(),
  mimeType: z.string().optional(),
  description: z.string().optional(),
  size: z.number().int().nonnegative().optional(),
  checksum: z.string().optional(),
  creationDate: z.string().optional(),
});

export const EmbeddedFileRefSchema: z.ZodType<EmbeddedFileRef> = z.object({
  kind: z.literal('key'),
  key: z.string().min(1),
});

export const EmbeddedFileItemSchema: z.ZodType<EmbeddedFileItem> = z.object({
  key: z.string(),
  name: z.string(),
  mimeType: z.string().optional(),
  description: z.string().optional(),
  size: z.number().int().nonnegative().optional(),
  checksum: z.string().optional(),
  creationDate: z.string().optional(),
  index: z.number().int().nonnegative(),
});
