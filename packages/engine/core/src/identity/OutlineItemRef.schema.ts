import { z } from 'zod';

import type { OutlineItemRef } from './OutlineItemRef';

/** Wire form of `OutlineItemRef` — see the type. */
export const OutlineItemRefSchema: z.ZodType<OutlineItemRef> = z.object({
  kind: z.literal('objectNumber'),
  objectNumber: z.number().int().positive(),
});
