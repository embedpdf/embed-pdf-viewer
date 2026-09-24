import { z } from 'zod';

import type { ResourceRef } from '../../../resource/BinarySource';

/**
 * How the stamp's content is scaled into its box (CSS `object-fit`
 * vocabulary): `'contain'` keeps the aspect ratio and stays fully visible,
 * `'cover'` keeps the aspect ratio and fills the box, cropping if needed, and
 * `'fill'` stretches.
 */
export type StampFit = 'contain' | 'cover' | 'fill';

export const StampFitSchema: z.ZodType<StampFit> = z.enum(['contain', 'cover', 'fill']);

export const ResourceRefSchema: z.ZodType<ResourceRef> = z.object({
  resource: z.string().min(1),
});
