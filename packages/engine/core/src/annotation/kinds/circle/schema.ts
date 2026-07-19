import { z } from 'zod';

import { AnnotationDraftBaseShape, AnnotationPatchBaseShape } from '../../base.schema';
import { ShapeDTOShape, ShapeDraftShape, ShapePatchShape } from '../shape.shared';
import type { CircleDraft } from './draft';
import type { CircleAnnotationDTO } from './dto';
import type { CirclePatch } from './patch';

export const CircleDTOSchema: z.ZodType<CircleAnnotationDTO> = z.object({
  ...ShapeDTOShape,
  subtype: z.literal('circle'),
}) as unknown as z.ZodType<CircleAnnotationDTO>;

export const CircleDraftSchema: z.ZodType<CircleDraft> = z.object({
  ...ShapeDraftShape,
  ...AnnotationDraftBaseShape,
  subtype: z.literal('circle'),
});

export const CirclePatchSchema: z.ZodType<CirclePatch> = z.object({
  ...ShapePatchShape,
  ...AnnotationPatchBaseShape,
  subtype: z.literal('circle'),
});
