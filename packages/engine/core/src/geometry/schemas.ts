/**
 * Zod schemas for engine PDF-document geometry. Exported from `wire.ts` ONLY
 * (never from `shared.ts`/`runtime`) so the zod-free runtime stays zod-free.
 */

import { z } from 'zod';

import type {
  CalloutLine,
  InkList,
  LinePoints,
  PdfPoint,
  PdfQuad,
  PdfRect,
  PdfRotation,
  PdfSize,
} from './primitives';

export const PdfPointSchema: z.ZodType<PdfPoint> = z.object({
  x: z.number(),
  y: z.number(),
});

export const LinePointsSchema: z.ZodType<LinePoints> = z.object({
  start: PdfPointSchema,
  end: PdfPointSchema,
});

/** `/CL` callout leader line — two points (straight) or three (knee-jointed). */
export const CalloutLineSchema: z.ZodType<CalloutLine> = z.union([
  z.tuple([PdfPointSchema, PdfPointSchema]),
  z.tuple([PdfPointSchema, PdfPointSchema, PdfPointSchema]),
]);

/** `/InkList` — an array of strokes, each an array of points. */
export const InkListSchema: z.ZodType<InkList> = z.array(z.array(PdfPointSchema));

export const PdfRectSchema: z.ZodType<PdfRect> = z.object({
  left: z.number(),
  bottom: z.number(),
  right: z.number(),
  top: z.number(),
});

export const PdfSizeSchema: z.ZodType<PdfSize> = z.object({
  width: z.number().nonnegative(),
  height: z.number().nonnegative(),
});

export const PdfQuadSchema: z.ZodType<PdfQuad> = z.object({
  p1: PdfPointSchema,
  p2: PdfPointSchema,
  p3: PdfPointSchema,
  p4: PdfPointSchema,
});

export const PdfRotationSchema: z.ZodType<PdfRotation> = z.union([
  z.literal(0),
  z.literal(90),
  z.literal(180),
  z.literal(270),
]);
