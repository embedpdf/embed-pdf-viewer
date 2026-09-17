import {
  PdfMeasurementSchema,
  PdfMeasureWriteSchema,
  PolylineIntentSchema,
  ShapeDimensionCaptionSchema,
  ShapeCaptionPatchSchema,
} from '../../../dto/Measure.schema';
import { z } from 'zod';

import { PdfPointSchema } from '../../../geometry/schemas';
import {
  AnnotationDraftBaseShape,
  AnnotationPatchBaseShape,
  LineEndingsSchema,
} from '../../base.schema';
import { VertexDTOShape, VertexDraftShape, VertexPatchShape } from '../vertex.shared';
import type { PolylineDraft } from './draft';
import type { PolylineAnnotationDTO } from './dto';
import type { PolylinePatch } from './patch';

export const PolylineDTOSchema: z.ZodType<PolylineAnnotationDTO> = z.object({
  intent: PolylineIntentSchema.optional(),
  measure: PdfMeasurementSchema.optional(),
  caption: ShapeDimensionCaptionSchema.optional(),
  ...VertexDTOShape,
  vertices: z.array(PdfPointSchema).min(2),
  lineEndings: LineEndingsSchema,
  subtype: z.literal('polyline'),
}) as unknown as z.ZodType<PolylineAnnotationDTO>;

export const PolylineDraftSchema: z.ZodType<PolylineDraft> = z.object({
  intent: PolylineIntentSchema.nullable().optional(),
  measure: PdfMeasureWriteSchema.nullable().optional(),
  caption: ShapeDimensionCaptionSchema.nullable().optional(),
  ...VertexDraftShape,
  ...AnnotationDraftBaseShape,
  vertices: z.array(PdfPointSchema).min(2),
  lineEndings: LineEndingsSchema.optional(),
  subtype: z.literal('polyline'),
});

export const PolylinePatchSchema: z.ZodType<PolylinePatch> = z.object({
  intent: PolylineIntentSchema.nullable().optional(),
  measure: PdfMeasureWriteSchema.nullable().optional(),
  caption: ShapeCaptionPatchSchema.nullable().optional(),
  ...VertexPatchShape,
  ...AnnotationPatchBaseShape,
  vertices: z.array(PdfPointSchema).min(2).optional(),
  lineEndings: LineEndingsSchema.optional(),
  subtype: z.literal('polyline'),
});
