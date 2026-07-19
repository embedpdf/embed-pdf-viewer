import { z } from 'zod';

import { AnnotationDraftBaseShape, AnnotationPatchBaseShape } from '../../base.schema';
import {
  TextMarkupDTOShape,
  TextMarkupDraftShape,
  TextMarkupPatchShape,
} from '../text-markup.shared';
import type { HighlightDraft } from './draft';
import type { HighlightAnnotationDTO } from './dto';
import type { HighlightPatch } from './patch';

export const HighlightDTOSchema: z.ZodType<HighlightAnnotationDTO> = z.object({
  ...TextMarkupDTOShape,
  subtype: z.literal('highlight'),
}) as unknown as z.ZodType<HighlightAnnotationDTO>;

export const HighlightDraftSchema: z.ZodType<HighlightDraft> = z.object({
  ...TextMarkupDraftShape,
  ...AnnotationDraftBaseShape,
  subtype: z.literal('highlight'),
});

export const HighlightPatchSchema: z.ZodType<HighlightPatch> = z.object({
  ...TextMarkupPatchShape,
  ...AnnotationPatchBaseShape,
  subtype: z.literal('highlight'),
});
