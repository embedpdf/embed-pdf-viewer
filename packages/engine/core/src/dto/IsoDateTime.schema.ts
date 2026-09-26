import { z } from 'zod';

import type { DateInput, IsoDateTime } from './IsoDateTime';

/** ISO 8601 with an offset (`Z` or `±HH:mm`) or without one. */
export const IsoDateTimeSchema: z.ZodType<IsoDateTime> = z
  .string()
  .datetime({ offset: true, local: true });

/**
 * A moment in a write. JSON carries the string; a `Date` only ever arrives
 * in-process (the local engine), and becomes that string on the wire.
 */
export const DateInputSchema: z.ZodType<DateInput> = z.union([IsoDateTimeSchema, z.date()]);
