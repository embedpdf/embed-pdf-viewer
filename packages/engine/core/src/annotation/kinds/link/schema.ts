import { z } from 'zod';

import type { PdfLinkTarget, PdfLinkTargetWritable } from '../../../dto/PdfLinkTarget';
import { PdfDestinationSchema } from '../../../dto/PdfDestination.schema';
import { PdfRectSchema } from '../../../geometry/schemas';
import {
  AnnotationBaseShape,
  AnnotationDraftBaseShape,
  AnnotationPatchBaseShape,
} from '../../base.schema';
import type { LinkDraft } from './draft';
import type { LinkAnnotationDTO } from './dto';
import type { LinkPatch } from './patch';

// Relocated to dto/PdfDestination.schema.ts (action payloads and
// openDestination share it); re-exported here so existing importers keep
// working.
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

export const LinkDTOSchema: z.ZodType<LinkAnnotationDTO> = z.object({
  ...AnnotationBaseShape,
  subtype: z.literal('link'),
  target: PdfLinkTargetSchema.nullable(),
}) as unknown as z.ZodType<LinkAnnotationDTO>;

export const LinkDraftSchema: z.ZodType<LinkDraft> = z.object({
  ...AnnotationDraftBaseShape,
  subtype: z.literal('link'),
  rect: PdfRectSchema,
  target: PdfLinkTargetWritableSchema.nullable(),
}) as unknown as z.ZodType<LinkDraft>;

export const LinkPatchSchema: z.ZodType<LinkPatch> = z.object({
  ...AnnotationPatchBaseShape,
  subtype: z.literal('link'),
  rect: PdfRectSchema.optional(),
  // Three-state: undefined=leave, value=replace /A, null=clear the target.
  target: PdfLinkTargetWritableSchema.nullable().optional(),
}) as unknown as z.ZodType<LinkPatch>;
