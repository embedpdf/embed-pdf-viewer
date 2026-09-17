import {
  PdfMeasurementSchema,
  PdfMeasureWriteSchema,
  LineIntentSchema,
  LineDimensionCaptionSchema,
  LineCaptionPatchSchema,
  LineLeaderSchema,
} from '../../../dto/Measure.schema';
import { z } from 'zod';

import { LinePointsSchema, PdfRectSchema } from '../../../geometry/schemas';
import {
  AnnotationBaseShape,
  AnnotationDraftBaseShape,
  AnnotationPatchBaseShape,
  LineEndingsSchema,
} from '../../base.schema';
import { FilledStyleDTOShape, FilledStyleDraftShape, FilledStylePatchShape } from '../style.shared';
import type { LineDraft } from './draft';
import type { LineAnnotationDTO } from './dto';
import type { LinePatch } from './patch';

export const LineDTOSchema: z.ZodType<LineAnnotationDTO> = z.object({
  intent: LineIntentSchema.optional(),
  measure: PdfMeasurementSchema.optional(),
  caption: LineDimensionCaptionSchema.optional(),
  leader: LineLeaderSchema.optional(),
  ...AnnotationBaseShape,
  ...FilledStyleDTOShape,
  linePoints: LinePointsSchema,
  lineEndings: LineEndingsSchema,
  rotation: z.number().optional(),
  subtype: z.literal('line'),
}) as unknown as z.ZodType<LineAnnotationDTO>;

export const LineDraftSchema: z.ZodType<LineDraft> = z.object({
  intent: LineIntentSchema.nullable().optional(),
  measure: PdfMeasureWriteSchema.nullable().optional(),
  caption: LineDimensionCaptionSchema.nullable().optional(),
  leader: LineLeaderSchema.nullable().optional(),
  ...FilledStyleDraftShape,
  ...AnnotationDraftBaseShape,
  linePoints: LinePointsSchema,
  rect: PdfRectSchema,
  lineEndings: LineEndingsSchema.optional(),
  rotation: z.number().nullable().optional(),
  subtype: z.literal('line'),
});

export const LinePatchSchema: z.ZodType<LinePatch> = z.object({
  intent: LineIntentSchema.nullable().optional(),
  measure: PdfMeasureWriteSchema.nullable().optional(),
  caption: LineCaptionPatchSchema.nullable().optional(),
  leader: LineLeaderSchema.nullable().optional(),
  ...FilledStylePatchShape,
  ...AnnotationPatchBaseShape,
  linePoints: LinePointsSchema.optional(),
  rect: PdfRectSchema.optional(),
  lineEndings: LineEndingsSchema.optional(),
  rotation: z.number().nullable().optional(),
  subtype: z.literal('line'),
});
