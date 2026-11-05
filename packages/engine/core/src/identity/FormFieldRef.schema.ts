import { z } from 'zod';

import type { FormFieldRef } from './FormFieldRef';
import { closed } from '../wire/reading';

/** Wire form of `FormFieldRef` — see the type. */
export const FormFieldRefSchema: z.ZodType<FormFieldRef> = closed(
  z.discriminatedUnion('kind', [
    z.object({
      kind: z.literal('objectNumber'),
      objectNumber: z.number().int().positive(),
    }),
    z.object({
      kind: z.literal('fqn'),
      name: z.string().min(1),
    }),
  ]),
);
