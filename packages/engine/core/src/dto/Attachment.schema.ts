import { z } from 'zod';

import { IsoDateTimeSchema } from './IsoDateTime.schema';

import type {
  Attachment,
  AttachmentFileInfo,
  AttachmentRef,
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
  mimeType: z.string().nullable(),
  description: z.string().nullable(),
  size: z.number().int().nonnegative().nullable(),
  checksum: z.string().nullable(),
  createdAt: IsoDateTimeSchema.nullable(),
  modifiedAt: IsoDateTimeSchema.nullable(),
});

export const AttachmentRefSchema: z.ZodType<AttachmentRef> = z.object({
  kind: z.literal('key'),
  key: z.string().min(1),
});

export const AttachmentSchema: z.ZodType<Attachment> = z.object({
  // A foreign tree entry whose key can't be read lists with an empty key.
  ref: z.object({ kind: z.literal('key'), key: z.string() }),
  name: z.string(),
  mimeType: z.string().nullable(),
  description: z.string().nullable(),
  size: z.number().int().nonnegative().nullable(),
  checksum: z.string().nullable(),
  createdAt: IsoDateTimeSchema.nullable(),
  modifiedAt: IsoDateTimeSchema.nullable(),
  index: z.number().int().nonnegative(),
});
