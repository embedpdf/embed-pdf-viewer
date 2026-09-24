import { PageRefSchema } from '../identity/PageRef.schema';
import { z } from 'zod';

import type {
  AnnotationBorderStyle,
  BlendMode,
  CaretIntent,
  Color,
  FreeTextIntent,
  InkIntent,
  LineEnding,
  LineEndings,
  PdfRectDifferences,
  StandardFont,
  StrikeoutIntent,
  TextAlignment,
} from './primitives';
import { PdfPointSchema, PdfRectSchema, PdfQuadSchema } from '../geometry/schemas';
import type { AnnotationRef } from '../identity/AnnotationRef';
import type { AnnotationStableId } from '../identity/AnnotationStableId';
import type { RevisionToken } from '../revision/RevisionToken';

/** @deprecated Use `PdfPointSchema` from `../geometry/schemas`. */
export const PointSchema = PdfPointSchema;
/** @deprecated Use `PdfRectSchema` from `../geometry/schemas`. */
export const RectSchema = PdfRectSchema;

export const ColorSchema: z.ZodType<Color> = z.object({
  r: z.number().int().min(0).max(255),
  g: z.number().int().min(0).max(255),
  b: z.number().int().min(0).max(255),
});

export const AnnotationBorderStyleSchema: z.ZodType<AnnotationBorderStyle> = z.enum([
  'solid',
  'dashed',
  'beveled',
  'inset',
]);

export const PdfRectDifferencesSchema: z.ZodType<PdfRectDifferences> = z.object({
  left: z.number().nonnegative(),
  top: z.number().nonnegative(),
  right: z.number().nonnegative(),
  bottom: z.number().nonnegative(),
});

export const LineEndingSchema: z.ZodType<LineEnding> = z.enum([
  'none',
  'square',
  'circle',
  'diamond',
  'open-arrow',
  'closed-arrow',
  'butt',
  'r-open-arrow',
  'r-closed-arrow',
  'slash',
]);

export const LineEndingsSchema: z.ZodType<LineEndings> = z.object({
  start: LineEndingSchema,
  end: LineEndingSchema,
});

export const StandardFontSchema: z.ZodType<StandardFont> = z.enum([
  'courier',
  'courier-bold',
  'courier-bold-oblique',
  'courier-oblique',
  'helvetica',
  'helvetica-bold',
  'helvetica-bold-oblique',
  'helvetica-oblique',
  'times-roman',
  'times-bold',
  'times-bold-italic',
  'times-italic',
  'symbol',
  'zapf-dingbats',
]);

export const TextAlignmentSchema: z.ZodType<TextAlignment> = z.enum(['left', 'center', 'right']);

export const FreeTextIntentSchema: z.ZodType<FreeTextIntent> = z.enum([
  'free-text',
  'free-text-callout',
]);

export const CaretIntentSchema: z.ZodType<CaretIntent> = z.literal('replace');

export const StrikeoutIntentSchema: z.ZodType<StrikeoutIntent> = z.literal('strikeout-text-edit');

export const InkIntentSchema: z.ZodType<InkIntent> = z.literal('ink-highlight');

export const BlendModeSchema: z.ZodType<BlendMode> = z.enum([
  'normal',
  'multiply',
  'screen',
  'overlay',
  'darken',
  'lighten',
  'color-dodge',
  'color-burn',
  'hard-light',
  'soft-light',
  'difference',
  'exclusion',
  'hue',
  'saturation',
  'color',
  'luminosity',
]);

export const AnnotationStableIdSchema: z.ZodType<AnnotationStableId> = z.discriminatedUnion(
  'kind',
  [
    z.object({ kind: z.literal('objectNumber'), value: z.number().int().nonnegative() }),
    z.object({ kind: z.literal('nm'), value: z.string() }),
  ],
);

export const RevisionTokenSchema: z.ZodType<RevisionToken> = z.object({
  docSessionId: z.string(),
  page: PageRefSchema,
  generation: z.number().int().nonnegative(),
});

export const AnnotationRefSchema: z.ZodType<AnnotationRef> = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('objectNumber'),
    page: PageRefSchema,
    annotObjectNumber: z.number().int().positive(),
  }),
  z.object({
    kind: z.literal('nm'),
    page: PageRefSchema,
    nm: z.string(),
  }),
  z.object({
    kind: z.literal('index'),
    page: PageRefSchema,
    index: z.number().int().nonnegative(),
    revision: RevisionTokenSchema,
  }),
]);
