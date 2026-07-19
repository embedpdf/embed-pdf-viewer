import { z } from 'zod';

import {
  FilledStyleDTOShape,
  FilledStyleDraftShape,
  FilledStylePatchShape,
  type FilledStyleDraftFields,
  type FilledStyleFields,
  type FilledStylePatchFields,
} from './style.shared';
import type { PdfPoint, PdfRect } from '../../geometry/primitives';
import { PdfPointSchema } from '../../geometry/schemas';
import { PdfRectSchema } from '../../geometry/schemas';
import type { AnnotationBase } from '../base';
import { AnnotationBaseShape } from '../base.schema';

/**
 * Vertex-family-specific fields. The two vertex subtypes (polygon/polyline)
 * carry their geometry as a `/Vertices` point list (ISO 32000 §12.5.6.9)
 * plus the common stroke/fill styling ({@link FilledStyleFields}). Polygon
 * layers a cloudy border (`/BE`) on top; polyline layers line endings
 * (`/LE`); each kind file adds those. (Polygon does not use `/RD` — its
 * geometry is fully described by `/Vertices` + `/Rect`, so `/RD` is for the
 * shape family only.)
 *
 * Like shapes, the engine takes an explicit `/Rect` on the Draft (the v3
 * plugin owns the bounding-box + rotation math, so the engine stays a
 * faithful persistence layer); the DTO inherits `rect` from
 * `AnnotationBase`.
 */
export interface VertexAnnotationFields extends FilledStyleFields {
  /** `/Vertices` — the ordered point list (PDF user space, y-up). */
  vertices: PdfPoint[];
  /**
   * `/EMBD_Metadata/Rotation` — ADVISORY rotation (degrees, PDF convention). The
   * vertices are already rotated (they ARE the portable visual); this scalar
   * just records the applied angle so EmbedPDF can show an oriented selection
   * box and offer reset. It carries NO `unrotatedRect`, so it is inert for AP
   * (PDFium ignores a lone `Rotation`).
   */
  rotation?: number;
}

export interface VertexDraftFields extends FilledStyleDraftFields {
  /** `/Vertices` geometry — required (vertex annotations are not derived). */
  vertices: PdfPoint[];
  /** `/Rect` bounding box — required (computed by the caller/plugin). */
  rect: PdfRect;
  /** Advisory rotation (deg). See {@link VertexAnnotationFields.rotation}. */
  rotation?: number;
}

export interface VertexPatchFields extends FilledStylePatchFields {
  vertices?: PdfPoint[];
  rect?: PdfRect;
  rotation?: number;
}

export const VertexDTOShape = {
  ...AnnotationBaseShape,
  ...FilledStyleDTOShape,
  vertices: z.array(PdfPointSchema),
  rotation: z.number().optional(),
} as const;

export const VertexDraftShape = {
  ...FilledStyleDraftShape,
  vertices: z.array(PdfPointSchema),
  rect: PdfRectSchema,
  rotation: z.number().optional(),
} as const;

export const VertexPatchShape = {
  ...FilledStylePatchShape,
  vertices: z.array(PdfPointSchema).optional(),
  rect: PdfRectSchema.optional(),
  rotation: z.number().optional(),
} as const;

/** Glue type used by each vertex kind file to construct its concrete DTO. */
export type VertexDTO<S extends string> = AnnotationBase & {
  subtype: S;
} & VertexAnnotationFields;
