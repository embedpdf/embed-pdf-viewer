import { z } from 'zod';

/**
 * How a stamp's appearance is scaled into its box (CSS `object-fit`
 * vocabulary): `'contain'` keeps the aspect ratio and stays fully visible,
 * `'cover'` keeps the aspect ratio and fills the box, cropping if needed, and
 * `'fill'` stretches.
 */
export type StampFit = 'contain' | 'cover' | 'fill';

export const StampFitSchema: z.ZodType<StampFit> = z.enum(['contain', 'cover', 'fill']);
