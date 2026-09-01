import { z } from 'zod';

import type { PdfDestination } from './PdfDestination';

const pageObjectNumber = z.number().int().positive();
/** Spec-nullable axis value: absent and `null` both mean "retain current". */
const axis = z.number().nullable().optional();

/**
 * Runtime schema for {@link PdfDestination}. Lives beside its DTO in `dto/`
 * so every destination-shaped surface (link targets, action-node payloads,
 * the document `openDestination`) shares one schema without an import cycle
 * through the annotation tree.
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
