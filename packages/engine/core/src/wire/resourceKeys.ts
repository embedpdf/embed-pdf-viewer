import { z } from 'zod';

/**
 * A multipart message carries each file as a part `resource:<key>`, and its
 * JSON names the file by role: `resources: { <role>: <key> }`, on the
 * object the files belong to. These are those objects, one per set of roles.
 */

/** A file's key: the `<key>` of its `resource:<key>` part. */
export const ResourceKeySchema = z.string().min(1);

/** An annotation write's files: its drawing and its attached file. */
export const AnnotationResourceKeysSchema = z
  .object({ appearance: ResourceKeySchema.optional(), file: ResourceKeySchema.optional() })
  .strict();

/** A drawn appearance: a signature's mark, as a one-page PDF or an image. */
export const AppearanceResourceKeysSchema = z.object({ appearance: ResourceKeySchema }).strict();

/** An attachment's file. */
export const FileResourceKeysSchema = z.object({ file: ResourceKeySchema }).strict();

/** The PDF whose pages an insert copies in. */
export const SourceResourceKeysSchema = z.object({ source: ResourceKeySchema }).strict();

/** An answer's picture. */
export const ImageResourceKeysSchema = z.object({ image: ResourceKeySchema }).strict();
