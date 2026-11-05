import { z } from 'zod';

import type { PageRef } from './PageRef';
import { closed } from '../wire/reading';

/** Wire form of `PageRef` — see the type. */
export const PageRefSchema: z.ZodType<PageRef> = z.object({
  kind: closed(z.literal('objectNumber')),
  objectNumber: z.number().int().positive(),
});
