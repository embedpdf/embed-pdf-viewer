import { z } from 'zod';
import { PdfRectSchema } from '../geometry/schemas';
import { validNumberFormat } from '../measure/format';

const float = z
  .number()
  .finite()
  .refine((n) => Number.isFinite(Math.fround(n)), 'Outside PDF float range');
const point = z.object({ x: float, y: float }).strict();
const positive = float.refine((n) => Math.fround(n) > 0, 'Must be positive in PDF float precision');
export const PdfNumberFormatSchema = z.object({
  unit: z.string(),
  conversion: float.optional(),
  fraction: z.enum(['decimal', 'fraction', 'round', 'truncate']).optional(),
  precision: z.number().int().optional(),
  fixed: z.boolean().optional(),
  thousands: z.string().optional(),
  decimal: z.string().optional(),
  prefixSpacing: z.string().optional(),
  suffixSpacing: z.string().optional(),
  labelPosition: z.enum(['suffix', 'prefix']).optional(),
});
export const PdfMeasureSchema = z.object({
  subtype: z.literal('rectilinear'),
  ratio: z.string().optional(),
  x: z.array(PdfNumberFormatSchema),
  y: z.array(PdfNumberFormatSchema).optional(),
  distance: z.array(PdfNumberFormatSchema),
  area: z.array(PdfNumberFormatSchema),
  angle: z.array(PdfNumberFormatSchema).optional(),
  slope: z.array(PdfNumberFormatSchema).optional(),
  origin: point.optional(),
  cyx: float.optional(),
});
const writableFormat = PdfNumberFormatSchema.extend({
  conversion: positive,
  precision: z.number().int().min(1).max(2147483647).optional(),
}).refine(validNumberFormat, 'Invalid number format precision');
export const PdfMeasureWriteSchema = PdfMeasureSchema.extend({
  x: z.array(writableFormat),
  y: z.array(writableFormat).optional(),
  distance: z.array(writableFormat),
  area: z.array(writableFormat),
  angle: z.array(writableFormat).optional(),
  slope: z.array(writableFormat).optional(),
  cyx: positive.optional(),
});
const geoMeasure = z.object({ subtype: z.literal('geospatial') });
const unknownMeasure = z.object({ subtype: z.literal('unknown') });
export const PdfForeignMeasureSchema = z.union([geoMeasure, unknownMeasure]);
export const PageScaleInputSchema = z.object({ measure: PdfMeasureWriteSchema.nullable() });
export const PdfMeasurementSchema = z.discriminatedUnion('subtype', [
  PdfMeasureSchema,
  geoMeasure,
  unknownMeasure,
]);
export const PageMeasurementViewportSchema = z.object({
  bbox: PdfRectSchema,
  name: z.string().optional(),
  measure: PdfMeasurementSchema.optional(),
  owned: z.boolean(),
});
export const LineIntentSchema = z.enum(['line-arrow', 'line-dimension']);
export const PolygonIntentSchema = z.enum(['polygon-cloud', 'polygon-dimension']);
export const PolylineIntentSchema = z.literal('polyline-dimension');
const offset = z.object({ along: float, perpendicular: float }).strict();
export const LineDimensionCaptionSchema = z
  .object({
    enabled: z.boolean(),
    position: z.enum(['inline', 'top']).optional(),
    offset: offset.optional(),
  })
  .strict();
export const ShapeDimensionCaptionSchema = z
  .object({ enabled: z.boolean(), center: point.optional() })
  .strict();
export const LineCaptionPatchSchema = z
  .object({
    enabled: z.boolean().optional(),
    position: z.enum(['inline', 'top']).nullable().optional(),
    offset: offset.nullable().optional(),
  })
  .strict();
export const ShapeCaptionPatchSchema = z
  .object({ enabled: z.boolean().optional(), center: point.nullable().optional() })
  .strict();
export const LineLeaderSchema = z
  .object({
    length: float,
    extension: float.refine((n) => n >= 0).optional(),
    offset: float.refine((n) => n >= 0).optional(),
  })
  .strict();
