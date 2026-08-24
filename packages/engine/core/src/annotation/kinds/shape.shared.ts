import { z } from 'zod';

import type { PdfRect } from '../../geometry/primitives';
import { PdfRectSchema } from '../../geometry/schemas';
import type { AnnotationBase } from '../base';
import { AnnotationBaseShape, PdfRectDifferencesSchema } from '../base.schema';
import type { PdfRectDifferences } from '../primitives';
import {
  FilledStyleDTOShape,
  FilledStyleDraftShape,
  FilledStylePatchShape,
  type FilledStyleDraftFields,
  type FilledStyleFields,
  type FilledStylePatchFields,
} from './style.shared';

/**
 * Shape-family-specific fields. The two shape subtypes (circle/square)
 * share their wire shape per ISO 32000 §12.5.6.8: they are `/Rect`-based
 * outlines with the common stroke/fill styling ({@link FilledStyleFields}),
 * an optional cloudy border effect (`/BE`), and optional rectangle
 * differences (`/RD`).
 *
 * Unlike the text-markup family (which derives `/Rect` from `quadPoints`),
 * shapes carry `/Rect` as their primary geometry — so the Draft requires
 * `rect` explicitly while the DTO inherits it from `AnnotationBase`.
 */
/**
 * Rotation fields shared by the rotatable box families (shapes + free-text).
 * `rotation` is degrees in PDF convention (the v3 plugin converts its
 * content-space clockwise angle at the boundary); `unrotatedRect` is the
 * logical (pre-rotation) box. Together they drive PDFium's `/EMBD_Metadata`
 * AP rotation (`/Matrix` + `/BBox`); `/Rect` stays the rotated visual AABB.
 */
export interface ShapeAnnotationFields extends FilledStyleFields {
  /** `/BE` cloudy border intensity; `null` when the border carries no effect. */
  cloudyIntensity: number | null;
  /** `/RD` rectangle differences (inset of drawn geometry from `/Rect`); `null` when absent. */
  rectDifferences: PdfRectDifferences | null;
  /** `/EMBD_Metadata/Rotation` — degrees, normalized `[0,360)`. */
  rotation?: number;
  /** `/EMBD_Metadata/UnrotatedRect` — the logical box (required when rotation != 0). */
  unrotatedRect?: PdfRect;
}

export interface ShapeDraftFields extends FilledStyleDraftFields {
  /** `/Rect` geometry — required for shapes (they are not derived from quads). */
  rect: PdfRect;
  cloudyIntensity?: number | null;
  rectDifferences?: PdfRectDifferences | null;
  rotation?: number | null;
  unrotatedRect?: PdfRect | null;
}

export interface ShapePatchFields extends FilledStylePatchFields {
  rect?: PdfRect;
  /** Tri-state (as `interiorColor`): omitted preserves, a value sets, `null` removes `/BE`. */
  cloudyIntensity?: number | null;
  /** Tri-state: omitted preserves, a value sets, `null` removes `/RD`. */
  rectDifferences?: PdfRectDifferences | null;
  /** Tri-state: omitted preserves, `null`/`0` flattens, a value sets (needs the box). */
  rotation?: number | null;
  /** Tri-state: omitted preserves, `null` removes, a value sets. */
  unrotatedRect?: PdfRect | null;
}

export const ShapeDTOShape = {
  ...AnnotationBaseShape,
  ...FilledStyleDTOShape,
  cloudyIntensity: z.number().positive().nullable(),
  rectDifferences: PdfRectDifferencesSchema.nullable(),
  rotation: z.number().optional(),
  unrotatedRect: PdfRectSchema.optional(),
} as const;

export const ShapeDraftShape = {
  ...FilledStyleDraftShape,
  rect: PdfRectSchema,
  cloudyIntensity: z.number().positive().nullable().optional(),
  rectDifferences: PdfRectDifferencesSchema.nullable().optional(),
  rotation: z.number().nullable().optional(),
  unrotatedRect: PdfRectSchema.nullable().optional(),
} as const;

export const ShapePatchShape = {
  ...FilledStylePatchShape,
  rect: PdfRectSchema.optional(),
  cloudyIntensity: z.number().positive().nullable().optional(),
  rectDifferences: PdfRectDifferencesSchema.nullable().optional(),
  rotation: z.number().nullable().optional(),
  unrotatedRect: PdfRectSchema.nullable().optional(),
} as const;

/** Glue type used by each shape kind file to construct its concrete DTO. */
export type ShapeDTO<S extends string> = AnnotationBase & {
  subtype: S;
} & ShapeAnnotationFields;
