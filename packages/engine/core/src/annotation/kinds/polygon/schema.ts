import {
  PdfMeasurementSchema,
  PdfMeasureWriteSchema,
  PolygonIntentSchema,
  ShapeDimensionCaptionSchema,
  ShapeCaptionPatchSchema,
} from '../../../dto/Measure.schema';
import { z } from 'zod';

import { PdfPointSchema } from '../../../geometry/schemas';
import { AnnotationDraftBaseShape, AnnotationPatchBaseShape } from '../../base.schema';
import { VertexDTOShape, VertexDraftShape, VertexPatchShape } from '../vertex.shared';
import type { PolygonDraft } from './draft';
import type { PolygonAnnotationDTO } from './dto';
import type { PolygonPatch } from './patch';

export const PolygonDTOSchema: z.ZodType<PolygonAnnotationDTO> = z.object({
  intent: PolygonIntentSchema.optional(),
  measure: PdfMeasurementSchema.optional(),
  caption: ShapeDimensionCaptionSchema.optional(),
  ...VertexDTOShape,
  vertices: z.array(PdfPointSchema).min(3),
  cloudyIntensity: z.number().positive().nullable(),
  subtype: z.literal('polygon'),
}) as unknown as z.ZodType<PolygonAnnotationDTO>;

export const PolygonDraftSchema: z.ZodType<PolygonDraft> = z.object({
  intent: PolygonIntentSchema.nullable().optional(),
  measure: PdfMeasureWriteSchema.nullable().optional(),
  caption: ShapeDimensionCaptionSchema.nullable().optional(),
  ...VertexDraftShape,
  ...AnnotationDraftBaseShape,
  vertices: z.array(PdfPointSchema).min(3),
  cloudyIntensity: z.number().positive().nullable().optional(),
  subtype: z.literal('polygon'),
});

export const PolygonPatchSchema: z.ZodType<PolygonPatch> = z.object({
  intent: PolygonIntentSchema.nullable().optional(),
  measure: PdfMeasureWriteSchema.nullable().optional(),
  caption: ShapeCaptionPatchSchema.nullable().optional(),
  ...VertexPatchShape,
  ...AnnotationPatchBaseShape,
  vertices: z.array(PdfPointSchema).min(3).optional(),
  cloudyIntensity: z.number().positive().nullable().optional(),
  subtype: z.literal('polygon'),
});
