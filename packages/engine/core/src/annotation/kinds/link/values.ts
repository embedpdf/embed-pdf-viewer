import { z } from 'zod';

import { PdfDestinationSchema } from '../../../dto/PdfDestination.schema';
import type { PdfLinkTarget, PdfLinkTargetWritable } from '../../../dto/PdfLinkTarget';

export { PdfDestinationSchema };

const GotoTargetSchema = z.object({ kind: z.literal('goto'), destination: PdfDestinationSchema });
const UriTargetSchema = z.object({ kind: z.literal('uri'), uri: z.string() });

export const PdfLinkTargetSchema: z.ZodType<PdfLinkTarget> = z.discriminatedUnion('kind', [
  GotoTargetSchema,
  UriTargetSchema,
  z.object({ kind: z.literal('goto-remote'), file: z.string() }),
  z.object({ kind: z.literal('launch'), path: z.string() }),
  z.object({ kind: z.literal('javascript') }),
  z.object({ kind: z.literal('named'), name: z.string() }),
  z.object({ kind: z.literal('unsupported') }),
]) as unknown as z.ZodType<PdfLinkTarget>;

/** Drafts/patches only author `goto`/`uri` — see {@link PdfLinkTargetWritable}. */
export const PdfLinkTargetWritableSchema: z.ZodType<PdfLinkTargetWritable> = z.discriminatedUnion(
  'kind',
  [GotoTargetSchema, UriTargetSchema],
) as unknown as z.ZodType<PdfLinkTargetWritable>;
