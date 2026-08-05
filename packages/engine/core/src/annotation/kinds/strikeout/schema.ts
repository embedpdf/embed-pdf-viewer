import { z } from 'zod';

import {
  AnnotationDraftBaseShape,
  AnnotationPatchBaseShape,
  StrikeoutIntentSchema,
} from '../../base.schema';
import {
  TextMarkupDTOShape,
  TextMarkupDraftShape,
  TextMarkupPatchShape,
} from '../text-markup.shared';
import type { StrikeoutDraft } from './draft';
import type { StrikeoutAnnotationDTO } from './dto';
import type { StrikeoutPatch } from './patch';

export const StrikeoutDTOSchema: z.ZodType<StrikeoutAnnotationDTO> = z.object({
  ...TextMarkupDTOShape,
  intent: StrikeoutIntentSchema.nullable(),
  subtype: z.literal('strikeout'),
}) as unknown as z.ZodType<StrikeoutAnnotationDTO>;

export const StrikeoutDraftSchema: z.ZodType<StrikeoutDraft> = z.object({
  ...TextMarkupDraftShape,
  ...AnnotationDraftBaseShape,
  intent: StrikeoutIntentSchema.optional(),
  subtype: z.literal('strikeout'),
});

export const StrikeoutPatchSchema: z.ZodType<StrikeoutPatch> = z.object({
  ...TextMarkupPatchShape,
  ...AnnotationPatchBaseShape,
  intent: StrikeoutIntentSchema.optional(),
  subtype: z.literal('strikeout'),
});
