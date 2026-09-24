import { z } from 'zod';

import {
  PdfForeignMeasureSchema,
  PdfMeasurementSchema,
  PdfMeasureWriteSchema,
} from '../../dto/Measure.schema';
import type { PdfForeignMeasure, PdfMeasure } from '../../dto/Measure';
import { PdfAnnotationActionsSchema } from '../../dto/PdfAction.schema';
import { PdfPointSchema, PdfQuadSchema, PdfRectSchema } from '../../geometry/schemas';
import { PageRefSchema } from '../../identity/PageRef.schema';
import {
  AnnotationBorderStyleSchema,
  AnnotationRefSchema,
  BlendModeSchema,
  ColorSchema,
  PdfRectDifferencesSchema,
} from '../base.schema';
import { field } from '../declaration';
import type { FreeTextFont } from '../primitives';

/** `/IRT` and `/RT`: the annotation this one replies to, and how it relates to it. */
export const AnnotationReplySchema = z.object({
  to: AnnotationRefSchema,
  type: z.enum(['reply', 'group']),
});

/** A write may leave out `type`: an absent `/RT` means `'reply'` (ISO 32000-2 §12.5.6.2). */
export const AnnotationReplyWriteSchema = z.object({
  to: AnnotationRefSchema,
  type: z.enum(['reply', 'group']).optional(),
});

/** A standard font name or a registered font key; the writer resolves which. */
export const FontNameSchema = z.string().min(1) as unknown as z.ZodType<FreeTextFont>;

/** One `/F` bit (ISO 32000-2 §12.5.3); every bit defaults to off. */
const flag = () => field.data(z.boolean()).optional();

/** Fields every annotation kind has. */
export const annotationBaseFields = {
  ref: field.engine(AnnotationRefSchema),
  page: field.engine(PageRefSchema),
  /** Position in the page's `/Annots`, 0-based. */
  index: field.engine(z.number().int().nonnegative()),
  identityQuality: field.engine(z.enum(['durable', 'weak'])),
  nm: field.data(z.string()).nullable().optional().createOnly(),
  rect: field.data(PdfRectSchema),
  contents: field.data(z.string()).nullable().optional(),
  subject: field.data(z.string()).nullable().optional(),
  blendMode: field.data(BlendModeSchema).optional(),
  invisible: flag(),
  hidden: flag(),
  print: flag(),
  noZoom: flag(),
  noRotate: flag(),
  noView: flag(),
  readOnly: flag(),
  locked: flag(),
  toggleNoView: flag(),
  lockedContents: flag(),
  reply: field.data(AnnotationReplySchema).writes(AnnotationReplyWriteSchema).nullable().optional(),
  /** `/Popup`, kept in sync by the engine from the popup's `parent`. */
  popup: field.engine(AnnotationRefSchema).nullable(),
  /** `/EMBD_Metadata/GroupID`: the group that owns the annotation. */
  groupId: field.data(z.string().min(1)).nullable().optional(),
  author: field.attribution(z.string()).nullable(),
  created: field.attribution(z.string().datetime()).nullable(),
  modified: field.attribution(z.string().datetime()).nullable(),
  userId: field.attribution(z.string()).nullable(),
  createdBy: field.attribution(z.string()).nullable(),
  updatedBy: field.attribution(z.string()).nullable(),
  /** The session that restored this annotation's attribution in an import. */
  importedBy: field.engine(z.string()).nullable(),
  /** `/A` and `/AA`. */
  actions: field.preserved(PdfAnnotationActionsSchema).nullable(),
};

// ── style ──

export const colorStyleFields = {
  color: field.data(ColorSchema).optional(),
  opacity: field.data(z.number().min(0).max(1)).optional(),
};

export const geometryStyleFields = {
  ...colorStyleFields,
  strokeWidth: field.data(z.number().nonnegative()).optional(),
  borderStyle: field.data(AnnotationBorderStyleSchema).optional(),
  dashArray: field.data(z.array(z.number().nonnegative())).nullable().optional(),
};

export const filledStyleFields = {
  ...geometryStyleFields,
  interiorColor: field.data(ColorSchema).nullable().optional(),
};

/** A box drawn rotated inside an axis-aligned `/Rect`. */
export const rotationFields = {
  rotation: field.data(z.number()).nullable().optional(),
  unrotatedRect: field.data(PdfRectSchema).nullable().optional(),
};

// ── families ──

export const textMarkupFields = {
  ...annotationBaseFields,
  ...colorStyleFields,
  /** Derived from the quads. */
  rect: field.engine(PdfRectSchema),
  quadPoints: field.data(z.array(PdfQuadSchema)),
};

export const shapeFields = {
  ...annotationBaseFields,
  ...filledStyleFields,
  ...rotationFields,
  cloudyIntensity: field.data(z.number().positive()).nullable().optional(),
  rectDifferences: field.data(PdfRectDifferencesSchema).nullable().optional(),
};

export const vertexFields = {
  ...annotationBaseFields,
  ...filledStyleFields,
  vertices: field.data(z.array(PdfPointSchema)),
  /** The angle already applied to the vertices. */
  rotation: field.data(z.number()).nullable().optional(),
};

/**
 * `/Measure`. A write takes a rectilinear scale, or sends back the marker a read
 * returned for a scale the engine can't model.
 */
export const measureField = field
  .data(PdfMeasurementSchema)
  .writes(
    z.union([PdfMeasureWriteSchema, PdfForeignMeasureSchema]) as z.ZodType<
      PdfMeasure | PdfForeignMeasure
    >,
  )
  .nullable()
  .optional();

/** Our caption on a polygon or polyline measurement; `null` when the shape has no caption flag. */
export const shapeCaptionFields = {
  captionEnabled: field.data(z.boolean()).nullable().optional(),
  /** `null` places the caption automatically. */
  captionCenter: field.data(PdfPointSchema).nullable().optional(),
};
