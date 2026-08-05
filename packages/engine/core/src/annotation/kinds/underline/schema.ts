import { z } from 'zod';

import { AnnotationDraftBaseShape, AnnotationPatchBaseShape } from '../../base.schema';
import {
  TextMarkupDTOShape,
  TextMarkupDraftShape,
  TextMarkupPatchShape,
} from '../text-markup.shared';
import type { UnderlineDraft } from './draft';
import type { UnderlineAnnotationDTO } from './dto';
import type { UnderlinePatch } from './patch';

export const UnderlineDTOSchema: z.ZodType<UnderlineAnnotationDTO> = z.object({
  ...TextMarkupDTOShape,
  subtype: z.literal('underline'),
}) as unknown as z.ZodType<UnderlineAnnotationDTO>;

export const UnderlineDraftSchema: z.ZodType<UnderlineDraft> = z.object({
  ...TextMarkupDraftShape,
  ...AnnotationDraftBaseShape,
  subtype: z.literal('underline'),
});

export const UnderlinePatchSchema: z.ZodType<UnderlinePatch> = z.object({
  ...TextMarkupPatchShape,
  ...AnnotationPatchBaseShape,
  subtype: z.literal('underline'),
});
