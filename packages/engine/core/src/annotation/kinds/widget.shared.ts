import { z } from 'zod';

import type { AnnotationBorderStyle, Color, StandardFont, TextAlignment } from '../primitives';
import {
  AnnotationBorderStyleSchema,
  ColorSchema,
  StandardFontSchema,
  TextAlignmentSchema,
} from '../base.schema';

/**
 * Widget-plane styling, using the same vocabulary as the sibling kinds
 * (`color` strokes the border, `interiorColor` fills, `strokeWidth` is the
 * border width — the free-text/shape convention) mapped onto the widget
 * dictionaries: /MK for colors, /BS for the border, /DA for the text
 * defaults, /Q for alignment.
 *
 * These fields are shared VERBATIM with `doc.forms` authoring: a
 * `WidgetPlacement.appearance` in `createField` is exactly
 * {@link WidgetAppearance}, and one writer applies both underneath.
 */
export interface WidgetStyleFields {
  /** `/MK /BC` — border colour. `null` when the widget draws no border colour. */
  color: Color | null;
  /** `/MK /BG` — background. `null` = transparent (no entry). */
  interiorColor: Color | null;
  /** `/BS /W` — border width. */
  strokeWidth: number;
  /** `/BS /S` — border style. */
  borderStyle: AnnotationBorderStyle;
  /** `/DA` font. Absent when the widget has no default appearance. */
  fontFamily?: StandardFont;
  /** `/DA` size; `0` = auto-size. */
  fontSize?: number;
  /** `/DA` colour. */
  fontColor?: Color;
  /** `/Q`. */
  textAlign: TextAlignment;
}

export interface WidgetStyleDraftFields {
  /** `/MK /BC`. `null` = write no border colour. */
  color?: Color | null;
  /** `/MK /BG`. `null` = transparent. */
  interiorColor?: Color | null;
  strokeWidth?: number;
  borderStyle?: AnnotationBorderStyle;
  fontFamily?: StandardFont;
  /** `0` = auto-size. */
  fontSize?: number;
  fontColor?: Color;
  textAlign?: TextAlignment;
}

/** Patch fields are the draft fields; `null` clears the colour entries. */
export type WidgetStylePatchFields = WidgetStyleDraftFields;

/**
 * The widget appearance vocabulary as consumed by `doc.forms` authoring
 * (`WidgetPlacement.appearance`). Identical to the widget annotation
 * draft's style surface — one vocabulary, one writer.
 */
export type WidgetAppearance = WidgetStyleDraftFields;

export const WidgetStyleDTOShape = {
  color: ColorSchema.nullable(),
  interiorColor: ColorSchema.nullable(),
  strokeWidth: z.number().nonnegative(),
  borderStyle: AnnotationBorderStyleSchema,
  fontFamily: StandardFontSchema.optional(),
  fontSize: z.number().nonnegative().optional(),
  fontColor: ColorSchema.optional(),
  textAlign: TextAlignmentSchema,
} as const;

export const WidgetStyleDraftShape = {
  color: ColorSchema.nullable().optional(),
  interiorColor: ColorSchema.nullable().optional(),
  strokeWidth: z.number().nonnegative().optional(),
  borderStyle: AnnotationBorderStyleSchema.optional(),
  fontFamily: StandardFontSchema.optional(),
  fontSize: z.number().nonnegative().optional(),
  fontColor: ColorSchema.optional(),
  textAlign: TextAlignmentSchema.optional(),
} as const;

export const WidgetStylePatchShape = WidgetStyleDraftShape;

export const WidgetAppearanceSchema: z.ZodType<WidgetAppearance> = z.object(WidgetStyleDraftShape);
