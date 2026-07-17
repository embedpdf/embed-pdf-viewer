import { z } from 'zod';

import type { PdfDestination } from '../../../dto/PdfDestination';
import type { PdfLinkTarget, PdfLinkTargetWritable } from '../../../dto/PdfLinkTarget';
import { PdfRectSchema } from '../../../geometry/schemas';
import {
  AnnotationBaseShape,
  AnnotationDraftBaseShape,
  AnnotationPatchBaseShape,
} from '../../base.schema';
import type { LinkDraft } from './draft';
import type { LinkAnnotationDTO } from './dto';
import type { LinkPatch } from './patch';

const pageObjectNumber = z.number().int().positive();
/** Spec-nullable axis value: absent and `null` both mean "retain current". */
const axis = z.number().nullable().optional();

/**
 * Runtime schema for {@link PdfDestination}. Lives with the link kind (its
 * first wire consumer); the outline/bookmark port reuses it from here.
 */
export const PdfDestinationSchema: z.ZodType<PdfDestination> = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('xyz'), pageObjectNumber, left: axis, top: axis, zoom: axis }),
  z.object({ kind: z.literal('fit'), pageObjectNumber }),
  z.object({ kind: z.literal('fitH'), pageObjectNumber, top: axis }),
  z.object({ kind: z.literal('fitV'), pageObjectNumber, left: axis }),
  z.object({
    kind: z.literal('fitR'),
    pageObjectNumber,
    left: z.number(),
    bottom: z.number(),
    right: z.number(),
    top: z.number(),
  }),
  z.object({ kind: z.literal('fitB'), pageObjectNumber }),
  z.object({ kind: z.literal('fitBH'), pageObjectNumber, top: axis }),
  z.object({ kind: z.literal('fitBV'), pageObjectNumber, left: axis }),
]) as unknown as z.ZodType<PdfDestination>;

const GotoTargetSchema = z.object({ kind: z.literal('goto'), destination: PdfDestinationSchema });
const UriTargetSchema = z.object({ kind: z.literal('uri'), uri: z.string() });

export const PdfLinkTargetSchema: z.ZodType<PdfLinkTarget> = z.discriminatedUnion('kind', [
  GotoTargetSchema,
  UriTargetSchema,
  z.object({ kind: z.literal('goto-remote'), file: z.string() }),
  z.object({ kind: z.literal('launch'), path: z.string() }),
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
  // No `.nullable()`: a target can be replaced but not cleared (see patch.ts).
  target: PdfLinkTargetWritableSchema.optional(),
}) as unknown as z.ZodType<LinkPatch>;
