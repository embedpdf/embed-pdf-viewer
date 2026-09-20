import { z } from 'zod';
import type { PageRef } from './PageRef';

/** Wire form of `PageRef` — see the type. */
export const PageRefSchema: z.ZodType<PageRef> = z.object({
  kind: z.literal('objectNumber'),
  pageObjectNumber: z.number().int().positive(),
});
