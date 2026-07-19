import { z } from 'zod';

import { AttachmentFileInfoSchema } from '../../../dto/Attachment.schema';
import { PdfRectSchema } from '../../../geometry/schemas';
import {
  AnnotationBaseShape,
  AnnotationDraftBaseShape,
  AnnotationPatchBaseShape,
} from '../../base.schema';
import { ColorStyleDTOShape, ColorStyleDraftShape, ColorStylePatchShape } from '../style.shared';
import type { FileAttachmentIcon, FileAttachmentWireDraft, WireAttachmentFile } from './draft';
import type { FileAttachmentAnnotationDTO } from './dto';
import type { FileAttachmentPatch } from './patch';

export const FileAttachmentIconSchema: z.ZodType<FileAttachmentIcon> = z.enum([
  'push-pin',
  'paperclip',
  'graph',
  'tag',
]);

/** Post-normalization form of the attached file: metadata + resource ref. */
export const WireAttachmentFileSchema: z.ZodType<WireAttachmentFile> = z.object({
  resource: z.string().min(1),
  name: z.string().min(1),
  mimeType: z.string().optional(),
  description: z.string().optional(),
});

export const FileAttachmentDTOSchema: z.ZodType<FileAttachmentAnnotationDTO> = z.object({
  ...AnnotationBaseShape,
  ...ColorStyleDTOShape,
  icon: FileAttachmentIconSchema,
  file: AttachmentFileInfoSchema,
  subtype: z.literal('file-attachment'),
}) as unknown as z.ZodType<FileAttachmentAnnotationDTO>;

export const FileAttachmentWireDraftSchema: z.ZodType<FileAttachmentWireDraft> = z.object({
  ...ColorStyleDraftShape,
  ...AnnotationDraftBaseShape,
  rect: PdfRectSchema,
  file: WireAttachmentFileSchema,
  icon: FileAttachmentIconSchema.optional(),
  subtype: z.literal('file-attachment'),
});

export const FileAttachmentPatchSchema: z.ZodType<FileAttachmentPatch> = z.object({
  ...ColorStylePatchShape,
  ...AnnotationPatchBaseShape,
  rect: PdfRectSchema.optional(),
  icon: FileAttachmentIconSchema.optional(),
  subtype: z.literal('file-attachment'),
});
