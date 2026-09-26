import { z } from 'zod';

import type { PdfDestination } from './PdfDestination';
import { PageRefSchema } from '../identity/PageRef.schema';

const page = PageRefSchema;
/** Spec-nullable axis value: absent and `null` both mean "retain current". */
const axis = z.number().nullable().optional();

/**
 * Runtime schema for {@link PdfDestination}. Lives beside its DTO in `dto/`
 * so every destination-shaped surface (link targets, action-node payloads,
 * the document `openDestination`) shares one schema without an import cycle
 * through the annotation tree.
 */
export const PdfDestinationSchema: z.ZodType<PdfDestination> = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('xyz'), page, left: axis, top: axis, zoom: axis }),
  z.object({ kind: z.literal('fit'), page }),
  z.object({ kind: z.literal('fitH'), page, top: axis }),
  z.object({ kind: z.literal('fitV'), page, left: axis }),
  z.object({
    kind: z.literal('fitR'),
    page,
    left: z.number(),
    bottom: z.number(),
    right: z.number(),
    top: z.number(),
  }),
  z.object({ kind: z.literal('fitB'), page }),
  z.object({ kind: z.literal('fitBH'), page, top: axis }),
  z.object({ kind: z.literal('fitBV'), page, left: axis }),
]) as unknown as z.ZodType<PdfDestination>;
