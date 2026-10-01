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

/** A file on the page: its icon fills `rect`, 20×20 at the usual size. */
export const FileAttachmentDeclaration = defineKind(
  'file-attachment',
  {
    ...annotationBaseFields,
    ...colorStyleFields,
    icon: field.data(FileAttachmentIconSchema).optional(),
    /**
     * `null` when the file specification has no embedded file. A write takes
     * what a read returns, so a read can be copied: on a create `null` is the
     * same as leaving it out, and an update that sends back the `null` a read
     * returned changes nothing (a file can't be removed).
     */
    file: field
      .data(AttachmentFileInfoSchema)
      .writes(AttachmentFileWriteSchema)
      .nullable()
      .optional(),
  },
  { file: 'required' },
);
