import { z } from 'zod';
import type { FormFieldRef } from './FormFieldRef';

/** Wire form of `FormFieldRef` — see the type. */
export const FormFieldRefSchema: z.ZodType<FormFieldRef> = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('objectNumber'),
    fieldObjectNumber: z.number().int().positive(),
  }),
  z.object({
    kind: z.literal('fqn'),
    name: z.string().min(1),
  }),
]);
