import { z } from 'zod';

import type { UnsupportedAnnotationDTO } from './dto';
import { AnnotationBaseShape } from '../../base.schema';

export const UnsupportedDTOSchema: z.ZodType<UnsupportedAnnotationDTO> = z.object({
  ...AnnotationBaseShape,
  subtype: z.literal('unsupported'),
  rawSubtypeCode: z.number().int(),
  rawSubtypeName: z.string().nullable(),
}) as unknown as z.ZodType<UnsupportedAnnotationDTO>;

export const UnsupportedDraftSchema: z.ZodType<never> = z.never();
export const UnsupportedPatchSchema: z.ZodType<never> = z.never();
