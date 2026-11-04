import { z } from 'zod';

import type { OutlineItemRef } from './OutlineItemRef';
import { closed } from '../wire/reading';

/** Wire form of `OutlineItemRef` — see the type. */
export const OutlineItemRefSchema: z.ZodType<OutlineItemRef> = z.object({
  kind: closed(z.literal('objectNumber')),
  objectNumber: z.number().int().positive(),
});
