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
  /** `/BE` cloudy border intensity. Absent/0 means a plain (non-cloudy) border. */
  cloudyIntensity?: number;
  /** `/RD` rectangle differences (inset of drawn geometry from `/Rect`). */
  rectDifferences?: PdfRectDifferences;
  /** `/EMBD_Metadata/Rotation` — degrees, normalized `[0,360)`. */
  rotation?: number;
  /** `/EMBD_Metadata/UnrotatedRect` — the logical box (required when rotation != 0). */
  unrotatedRect?: PdfRect;
}

export interface ShapeDraftFields extends FilledStyleDraftFields {
  /** `/Rect` geometry — required for shapes (they are not derived from quads). */
  rect: PdfRect;
  cloudyIntensity?: number;
  rectDifferences?: PdfRectDifferences;
  rotation?: number;
  unrotatedRect?: PdfRect;
}

export interface ShapePatchFields extends FilledStylePatchFields {
  rect?: PdfRect;
  cloudyIntensity?: number;
  rectDifferences?: PdfRectDifferences;
  rotation?: number;
  unrotatedRect?: PdfRect;
}

export const ShapeDTOShape = {
  ...AnnotationBaseShape,
  ...FilledStyleDTOShape,
  cloudyIntensity: z.number().nonnegative().optional(),
  rectDifferences: PdfRectDifferencesSchema.optional(),
  rotation: z.number().optional(),
  unrotatedRect: PdfRectSchema.optional(),
} as const;

export const ShapeDraftShape = {
  ...FilledStyleDraftShape,
  rect: PdfRectSchema,
  cloudyIntensity: z.number().nonnegative().optional(),
  rectDifferences: PdfRectDifferencesSchema.optional(),
  rotation: z.number().optional(),
  unrotatedRect: PdfRectSchema.optional(),
} as const;

export const ShapePatchShape = {
  ...FilledStylePatchShape,
  rect: PdfRectSchema.optional(),
  cloudyIntensity: z.number().nonnegative().optional(),
  rectDifferences: PdfRectDifferencesSchema.optional(),
  rotation: z.number().optional(),
  unrotatedRect: PdfRectSchema.optional(),
} as const;

/** Glue type used by each shape kind file to construct its concrete DTO. */
export type ShapeDTO<S extends string> = AnnotationBase & {
  subtype: S;
} & ShapeAnnotationFields;
