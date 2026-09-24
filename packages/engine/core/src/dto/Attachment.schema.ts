import { z } from 'zod';

import type {
  AttachmentFileInfo,
  EmbeddedFileItem,
  EmbeddedFileRef,
  WireAttachmentFile,
} from './Attachment';

/**
 * Wire schemas for the attachment vocabulary (see `Attachment.ts`). The
 * write-side `AttachmentFileSource` carries bytes and never appears on the
 * wire; `WireAttachmentFile` is its form there.
 */

export const WireAttachmentFileSchema: z.ZodType<WireAttachmentFile> = z.object({
  resource: z.string().min(1),
  name: z.string().min(1),
  mimeType: z.string().optional(),
  description: z.string().optional(),
});

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
