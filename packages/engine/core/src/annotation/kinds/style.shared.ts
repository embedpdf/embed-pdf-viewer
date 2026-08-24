import { z } from 'zod';

import { AnnotationBorderStyleSchema, ColorSchema } from '../base.schema';
import type { AnnotationBorderStyle, Color } from '../primitives';

/**
 * Composable styling layers shared by every annotation family, named after
 * the PDF entries they map onto so the v3 wire vocabulary matches ISO 32000:
 *
 *   ColorStyleFields    -> `/C` (color) + `/CA` (opacity)        — universal
 *   GeometryStyleFields -> + `/BS` (border style / width / dash) — geometric
 *   FilledStyleFields   -> + `/IC` (interior color)              — filled shapes
 *
 * There is exactly one `/C` in the spec ("Color") and one `/IC` ("Interior
 * Color") — there is no "stroke color" — so every family that carries `/C`
 * exposes the same `color` field. This is what lets a multi-select "change
 * colour" operate uniformly across text-markup, lines, and shapes.
 *
 * Composition by family:
 *   - text-markup (highlight/underline/squiggly/strikeout) -> ColorStyleFields
 *   - ink                                                   -> GeometryStyleFields
 *   - square/circle/polygon/polyline/line                  -> FilledStyleFields
 */

// ── /C + /CA — present on every annotation ──────────────────────────────
export interface ColorStyleFields {
  /** `/C` color. Stroke colour for geometric kinds; highlight colour for markup. */
  color: Color;
  /** `/CA` constant opacity, 0..1. */
  opacity: number;
}

export interface ColorStyleDraftFields {
  color?: Color;
  opacity?: number;
}

export type ColorStylePatchFields = ColorStyleDraftFields;

export const ColorStyleDTOShape = {
  color: ColorSchema,
  opacity: z.number().min(0).max(1),
} as const;

export const ColorStyleDraftShape = {
  color: ColorSchema.optional(),
  opacity: z.number().min(0).max(1).optional(),
} as const;

export const ColorStylePatchShape = ColorStyleDraftShape;

// ── + /BS — geometric kinds (shapes, vertex, line, ink) ─────────────────
export interface GeometryStyleFields extends ColorStyleFields {
  /** `/BS /W` border width, in PDF points. */
  strokeWidth: number;
  /** `/BS /S` border style. */
  borderStyle: AnnotationBorderStyle;
  /** `/BS /D` dash pattern. Only meaningful when `borderStyle === 'dashed'`. */
  dashArray?: number[];
}

export interface GeometryStyleDraftFields extends ColorStyleDraftFields {
  strokeWidth?: number;
  borderStyle?: AnnotationBorderStyle;
  dashArray?: number[];
}

export type GeometryStylePatchFields = GeometryStyleDraftFields;

export const GeometryStyleDTOShape = {
  ...ColorStyleDTOShape,
  strokeWidth: z.number().nonnegative(),
  borderStyle: AnnotationBorderStyleSchema,
  dashArray: z.array(z.number().nonnegative()).optional(),
} as const;

export const GeometryStyleDraftShape = {
  ...ColorStyleDraftShape,
  strokeWidth: z.number().nonnegative().optional(),
  borderStyle: AnnotationBorderStyleSchema.optional(),
  dashArray: z.array(z.number().nonnegative()).optional(),
} as const;

export const GeometryStylePatchShape = GeometryStyleDraftShape;

// ── + /IC — filled geometric kinds (shapes, vertex, line) ───────────────
export interface FilledStyleFields extends GeometryStyleFields {
  /** `/IC` interior (fill) color. `null` when the annotation has no fill. */
  interiorColor: Color | null;
}

export interface FilledStyleDraftFields extends GeometryStyleDraftFields {
  interiorColor?: Color | null;
}

export type FilledStylePatchFields = FilledStyleDraftFields;

export const FilledStyleDTOShape = {
  ...GeometryStyleDTOShape,
  interiorColor: ColorSchema.nullable(),
} as const;

export const FilledStyleDraftShape = {
  ...GeometryStyleDraftShape,
  interiorColor: ColorSchema.nullable().optional(),
} as const;

export const FilledStylePatchShape = FilledStyleDraftShape;
