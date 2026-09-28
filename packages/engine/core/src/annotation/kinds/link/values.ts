import { z } from 'zod';

import type { PdfDestination } from '../../../dto/PdfDestination';
import { PdfDestinationSchema } from '../../../dto/PdfDestination.schema';
import type { PdfLinkTarget, PdfLinkTargetWritable } from '../../../dto/PdfLinkTarget';

export { PdfDestinationSchema };

const GotoTargetSchema = z.object({ kind: z.literal('goto'), destination: PdfDestinationSchema });
const UriTargetSchema = z.object({ kind: z.literal('uri'), uri: z.string() });

/** A link's target as annotation reads carry it: a destination in the file's coordinates. */
export const PdfLinkTargetSchema: z.ZodType<PdfLinkTarget<PdfDestination>> = z.discriminatedUnion(
  'kind',
  [
    GotoTargetSchema,
    UriTargetSchema,
    z.object({ kind: z.literal('goto-remote'), file: z.string() }),
    z.object({ kind: z.literal('launch'), path: z.string() }),
    z.object({ kind: z.literal('javascript') }),
    z.object({ kind: z.literal('named'), name: z.string() }),
    z.object({ kind: z.literal('unsupported') }),
  ],
) as unknown as z.ZodType<PdfLinkTarget<PdfDestination>>;

/** Drafts/patches only author `goto`/`uri` — see {@link PdfLinkTargetWritable}. */
export const PdfLinkTargetWritableSchema: z.ZodType<PdfLinkTargetWritable<PdfDestination>> =
  z.discriminatedUnion('kind', [GotoTargetSchema, UriTargetSchema]) as unknown as z.ZodType<
    PdfLinkTargetWritable<PdfDestination>
  >;
