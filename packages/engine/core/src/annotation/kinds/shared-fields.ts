import { z } from 'zod';

import {
  PdfForeignMeasureSchema,
  PdfMeasurementSchema,
  PdfMeasureWriteSchema,
} from '../../dto/Measure.schema';
import type { PdfForeignMeasure, PdfMeasure } from '../../dto/Measure';
import { PdfAnnotationActionsSchema } from '../../dto/PdfAction.schema';
import {
  PdfPointSchema,
  PdfQuadSchema,
  PdfRectSchema,
  PdfTopLeftSchema,
} from '../../geometry/schemas';
import { PageRefSchema } from '../../identity/PageRef.schema';
import {
  AnnotationBorderStyleSchema,
  AnnotationRefSchema,
  BlendModeSchema,
  ColorSchema,
} from '../base.schema';
import { field } from '../declaration';
import type { FreeTextFont } from '../primitives';
import { DateInputSchema, IsoDateTimeSchema } from '../../dto/IsoDateTime.schema';

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
  /** `/CreationDate`. */
  createdAt: field.attribution(IsoDateTimeSchema).writes(DateInputSchema).nullable(),
  /** `/M`. */
  modifiedAt: field.attribution(IsoDateTimeSchema).writes(DateInputSchema).nullable(),
  userId: field.attribution(z.string()).nullable(),
  createdBy: field.attribution(z.string()).nullable(),
  /** `/EMBD_Metadata/UpdatedBy`. */
  modifiedBy: field.attribution(z.string()).nullable(),
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

/**
 * `rect` where another field gives the shape (a box, points, quads, an icon's
 * corner): where the annotation sits on the page, the upright box around all
 * it draws. The engine works it out; an update may send back the `rect` it
 * read.
 */
export const drawnRectFields = {
  rect: field.engine(PdfRectSchema).readBack(),
};

/**
 * The turn of a kind drawn from points (line, polyline, polygon, ink): the
 * points are upright, and the turn takes them about the middle of their box,
 * as a square turns about its box.
 */
export const pointsTurnFields = {
  /** Degrees clockwise, about the middle of the points' box. */
  rotation: field.data(z.number()).nullable().optional(),
};

/**
 * A kind drawn about a box that can turn: square, circle, free text, stamp
 * and caret. The caller gives the box and the turn; `rect` takes in the
 * turned box and what the drawing adds around it (a cloudy border's bumps, a
 * callout's line and arrow).
 */
export const boxFields = {
  ...drawnRectFields,
  /** The shape's own box, before any turn: a callout's text box. */
  box: field.data(PdfRectSchema),
  /** Degrees clockwise, about the middle of `box`. */
  rotation: field.data(z.number()).nullable().optional(),
};

// ── families ──

export const textMarkupFields = {
  ...annotationBaseFields,
  ...colorStyleFields,
  /** The box around the quads. */
  ...drawnRectFields,
  quadPoints: field.data(z.array(PdfQuadSchema).min(1)),
};

export const shapeFields = {
  ...annotationBaseFields,
  ...filledStyleFields,
  ...boxFields,
  cloudyIntensity: field.data(z.number().positive()).nullable().optional(),
};

export const vertexFields = {
  ...annotationBaseFields,
  ...filledStyleFields,
  ...drawnRectFields,
  vertices: field.data(z.array(PdfPointSchema)),
  ...pointsTurnFields,
};

/**
 * A note's or a file's icon: a fixed-size symbol placed by its left and top
 * edges, the corner PDF keeps in place for an icon that doesn't zoom.
 */
export const iconFields = {
  ...drawnRectFields,
  /** The icon's left edge and top edge. */
  at: field.data(PdfTopLeftSchema),
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
