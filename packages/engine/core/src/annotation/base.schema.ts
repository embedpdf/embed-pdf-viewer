import { z } from 'zod';

import type {
  AnnotationBorderStyle,
  BlendMode,
  CaretIntent,
  Color,
  DrawnBorderStyle,
  FreeTextIntent,
  InkIntent,
  LineEnding,
  LineEndings,
  StandardFont,
  StrikeoutIntent,
  TextAlignment,
  VerticalAlignment,
  WidgetBorderStyle,
  WidgetCheckStyle,
} from './primitives';
import { STANDARD_FONTS } from './primitives';
import type { AnnotationRef } from '../identity/AnnotationRef';
import { PageRefSchema } from '../identity/PageRef.schema';
import { closed } from '../wire/reading';

export const ColorSchema: z.ZodType<Color> = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "expected a color as '#rrggbb'");

export const AnnotationBorderStyleSchema: z.ZodType<AnnotationBorderStyle> = closed(
  z.enum(['solid', 'dashed', 'beveled', 'inset']),
);

export const WidgetBorderStyleSchema: z.ZodType<WidgetBorderStyle> = closed(
  z.enum(['solid', 'dashed', 'beveled', 'inset', 'underline']),
);

export const WidgetCheckStyleSchema: z.ZodType<WidgetCheckStyle> = closed(
  z.enum(['check', 'cross', 'star', 'circle', 'square', 'diamond']),
);

/** What a write takes for a border that isn't a widget's. */
export const DrawnBorderStyleSchema: z.ZodType<DrawnBorderStyle> = z.enum(['solid', 'dashed']);

/**
 * A dash pattern a write sets: lengths of line, then gap, at least one. An
 * empty pattern draws a solid line (ISO 32000 8.4.3.6), which is
 * `borderStyle: 'solid'`, so a write refuses it; a read never returns one.
 */
export const DashArrayWriteSchema: z.ZodType<number[]> = z.array(z.number().nonnegative()).min(1);

export const LineEndingSchema: z.ZodType<LineEnding> = closed(
  z.enum([
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
  ]),
);

export const LineEndingsSchema: z.ZodType<LineEndings> = z.object({
  start: LineEndingSchema,
  end: LineEndingSchema,
});

export const StandardFontSchema: z.ZodType<StandardFont> = z.enum(STANDARD_FONTS);

export const TextAlignmentSchema: z.ZodType<TextAlignment> = closed(
  z.enum(['left', 'center', 'right']),
);

export const FreeTextIntentSchema: z.ZodType<FreeTextIntent> = closed(
  z.enum(['free-text', 'free-text-callout', 'free-text-typewriter']),
);

/** The intents a write makes: a typewriter is only sent back as read. */
export const FreeTextIntentWriteSchema: z.ZodType<Exclude<FreeTextIntent, 'free-text-typewriter'>> =
  z.enum(['free-text', 'free-text-callout']);

export const VerticalAlignmentSchema: z.ZodType<VerticalAlignment> = closed(
  z.enum(['top', 'middle', 'bottom']),
);

export const CaretIntentSchema: z.ZodType<CaretIntent> = closed(z.literal('replace'));

export const StrikeoutIntentSchema: z.ZodType<StrikeoutIntent> = closed(
  z.literal('strikeout-text-edit'),
);

export const InkIntentSchema: z.ZodType<InkIntent> = closed(z.literal('ink-highlight'));

export const BlendModeSchema: z.ZodType<BlendMode> = closed(
  z.enum([
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
  ]),
);

export const AnnotationRefSchema: z.ZodType<AnnotationRef> = closed(
  z.discriminatedUnion('kind', [
    z.object({
      kind: z.literal('objectNumber'),
      page: PageRefSchema,
      objectNumber: z.number().int().positive(),
    }),
    z.object({
      kind: z.literal('baseIndex'),
      page: PageRefSchema,
      baseIndex: z.number().int().nonnegative(),
    }),
  ]),
);
