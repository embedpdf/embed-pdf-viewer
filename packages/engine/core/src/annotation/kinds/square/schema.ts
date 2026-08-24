import { z } from 'zod';

import { AnnotationDraftBaseShape, AnnotationPatchBaseShape } from '../../base.schema';
import { ShapeDTOShape, ShapeDraftShape, ShapePatchShape } from '../shape.shared';
import type { SquareDraft } from './draft';
import type { SquareAnnotationDTO } from './dto';
import type { SquarePatch } from './patch';

export const SquareDTOSchema: z.ZodType<SquareAnnotationDTO> = z.object({
  ...ShapeDTOShape,
  subtype: z.literal('square'),
}) as unknown as z.ZodType<SquareAnnotationDTO>;

export const SquareDraftSchema: z.ZodType<SquareDraft> = z.object({
  ...ShapeDraftShape,
  ...AnnotationDraftBaseShape,
  subtype: z.literal('square'),
});

export const SquarePatchSchema: z.ZodType<SquarePatch> = z.object({
  ...ShapePatchShape,
  ...AnnotationPatchBaseShape,
  subtype: z.literal('square'),
});
