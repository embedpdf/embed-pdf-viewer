import { z } from 'zod';

import { AnnotationDraftBaseShape, AnnotationPatchBaseShape } from '../../base.schema';
import {
  TextMarkupDTOShape,
  TextMarkupDraftShape,
  TextMarkupPatchShape,
} from '../text-markup.shared';
import type { SquigglyDraft } from './draft';
import type { SquigglyAnnotationDTO } from './dto';
import type { SquigglyPatch } from './patch';

export const SquigglyDTOSchema: z.ZodType<SquigglyAnnotationDTO> = z.object({
  ...TextMarkupDTOShape,
  subtype: z.literal('squiggly'),
}) as unknown as z.ZodType<SquigglyAnnotationDTO>;

export const SquigglyDraftSchema: z.ZodType<SquigglyDraft> = z.object({
  ...TextMarkupDraftShape,
  ...AnnotationDraftBaseShape,
  subtype: z.literal('squiggly'),
});

export const SquigglyPatchSchema: z.ZodType<SquigglyPatch> = z.object({
  ...TextMarkupPatchShape,
  ...AnnotationPatchBaseShape,
  subtype: z.literal('squiggly'),
});
