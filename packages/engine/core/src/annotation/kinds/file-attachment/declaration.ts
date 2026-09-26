import { z } from 'zod';

import { AttachmentFileInfoSchema } from '../../../dto/Attachment.schema';
import { defineKind, field } from '../../declaration';
import { annotationBaseFields, colorStyleFields } from '../shared-fields';
import { FileAttachmentIconSchema } from './values';

/**
 * The file's metadata; its bytes travel as the `file` resource. What a read
 * adds (size, checksum, creation date) comes from the bytes and is ignored.
 * A create may leave it out when the resource is a `File`, which brings its
 * name and type.
 */
const AttachmentFileWriteSchema = z.object({
  name: z.string().min(1),
  mimeType: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
});

export const FileAttachmentDeclaration = defineKind(
  'file-attachment',
  {
    ...annotationBaseFields,
    ...colorStyleFields,
    icon: field.data(FileAttachmentIconSchema).optional(),
    /** `null` when the file specification has no embedded file. */
    file: field
      .data(AttachmentFileInfoSchema)
      .writes(AttachmentFileWriteSchema)
      .nullableOnRead()
      .optional(),
  },
  { file: 'required' },
);
