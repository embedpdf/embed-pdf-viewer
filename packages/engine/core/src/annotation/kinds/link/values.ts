import { z } from 'zod';

import type { PdfDestination } from '../../../dto/PdfDestination';
import { PageDestinationSchema, PdfDestinationSchema } from '../../../dto/PdfDestination.schema';
import type { PdfLinkTarget, PdfLinkTargetWritable } from '../../../dto/PdfLinkTarget';

export { PdfDestinationSchema };

/** A link target's two schemas, a read and a write, for destinations of one kind. */
function linkTargetSchemasFor<Destination>(destination: z.ZodType<Destination>) {
  const goto = z.object({ kind: z.literal('goto'), destination });
  const uri = z.object({ kind: z.literal('uri'), uri: z.string() });
  const read = z.discriminatedUnion('kind', [
    goto,
    uri,
    z.object({ kind: z.literal('goto-remote'), file: z.string() }),
    z.object({ kind: z.literal('launch'), path: z.string() }),
    z.object({ kind: z.literal('javascript') }),
    z.object({ kind: z.literal('named'), name: z.string() }),
    z.object({ kind: z.literal('unsupported') }),
  ]) as unknown as z.ZodType<PdfLinkTarget<Destination>>;
  /** Drafts and patches only author `goto` and `uri`; see {@link PdfLinkTargetWritable}. */
  const write = z.discriminatedUnion('kind', [goto, uri]) as unknown as z.ZodType<
    PdfLinkTargetWritable<Destination>
  >;
  return { read, write };
}

const PAGE_SPACE = linkTargetSchemasFor(PageDestinationSchema);
const FILE_SPACE = linkTargetSchemasFor(PdfDestinationSchema);

/** A link's target: a destination in page space. */
export const PdfLinkTargetSchema = PAGE_SPACE.read;
/** What a create or an update may set as a link's target. */
export const PdfLinkTargetWritableSchema = PAGE_SPACE.write;

/** A link's target as the engine reads the file: a destination in the file's coordinates. */
export const FileLinkTargetSchema: z.ZodType<PdfLinkTarget<PdfDestination>> = FILE_SPACE.read;
export const FileLinkTargetWritableSchema: z.ZodType<PdfLinkTargetWritable<PdfDestination>> =
  FILE_SPACE.write;
