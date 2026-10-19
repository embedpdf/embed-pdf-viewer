import { z } from 'zod';
import type { PageRef } from './PageRef';

/** Wire form of `PageRef` — see the type. */
export const PageRefSchema: z.ZodType<PageRef> = z.object({
  kind: z.literal('objectNumber'),
  objectNumber: z.number().int().positive(),
});
