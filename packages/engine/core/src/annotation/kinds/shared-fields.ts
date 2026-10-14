import { z } from 'zod';

import { DateInputSchema, IsoDateTimeSchema } from '../../dto/IsoDateTime.schema';
import type { PdfForeignMeasure, PdfMeasure } from '../../dto/Measure';
import {
  PdfForeignMeasureSchema,
  PdfMeasurementSchema,
  PdfMeasureWriteSchema,
} from '../../dto/Measure.schema';
import { FileAnnotationActionsSchema } from '../../dto/PdfAction.schema';
import {
  PdfPointSchema,
  PdfQuadSchema,
  PdfRectSchema,
  PdfRotationSchema,
} from '../../geometry/schemas';
import { PageRefSchema } from '../../identity/PageRef.schema';
import {
  AnnotationBorderStyleSchema,
  DrawnBorderStyleSchema,
  AnnotationRefSchema,
  BlendModeSchema,
  ColorSchema,
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
  /**
   * Whether the file holds its appearance (`/AP /N`). Without one, every
   * viewer draws the annotation from its fields: the engine in memory, never
   * written.
   */
  hasAppearance: field.engine(z.boolean()),
  /**
   * `/AS`: which state of its appearance the annotation shows, when the
   * appearance has states (a check box's `Off` and its on state); `null`
   * when it names none. The appearance images are labelled with the same
   * names, so this picks the one to show.
   */
  appearanceState: field.engine(z.string()).nullable(),
  nm: field.data(z.string()).nullable().optional().createOnly(),
  rect: field.data(PdfRectSchema).space('box'),
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
  actions: field.preserved(FileAnnotationActionsSchema).nullable().space('actions'),
};

// ── style ──

export const colorStyleFields = {
  color: field.data(ColorSchema).optional(),
  opacity: field.data(z.number().min(0).max(1)).optional(),
};

export const geometryStyleFields = {
  ...colorStyleFields,
  strokeWidth: field.data(z.number().nonnegative()).optional(),
  /** `beveled` and `inset` are read from other apps' files and kept; only widgets draw them. */
  borderStyle: field
    .data(AnnotationBorderStyleSchema)
    .writes(DrawnBorderStyleSchema)
    .readBack()
    .optional(),
  dashArray: field.data(z.array(z.number().nonnegative())).nullable().optional(),
};

export const filledStyleFields = {
  ...geometryStyleFields,
  interiorColor: field.data(ColorSchema).nullable().optional(),
};

/**
 * `rect` where another field gives the shape (a box, points, quads): where
 * the annotation sits on the page, the upright box around all it draws. The
 * engine works it out from the shape, so a create's `rect` is worked out
 * again. An update's `rect` other than the one read puts the shape there
 * (`shapeForRect`); the rect read, sent back, changes nothing.
 */
export const drawnRectFields = {
  rect: field.engine(PdfRectSchema).readBack().space('box'),
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
 *
 * A create gives `box`, or `rect` with a quarter turn: where the turned box
 * stands on the page, which pins the box down (`pdfQuarterTurnBox`). At any
 * other angle many boxes share one rect, so a create by `rect` is refused.
 */
export const boxFields = {
  ...drawnRectFields,
  /** The shape's own box, before any turn: a callout's text box. */
  box: field.data(PdfRectSchema).space('box').optional(),
  /** Degrees clockwise, about the middle of `box`. */
  rotation: field.data(z.number()).nullable().optional(),
};

/**
 * A widget's frame and its turn: the box its contents are laid out in, and
 * a quarter turn (`/MK /R`, which the file holds counterclockwise), so every
 * viewer can lay an upright editor over it. `rect` is where the widget
 * stands on the page, the box turned. A create gives `box` or `rect`, as a
 * box kind's does.
 */
export const widgetBoxFields = {
  ...drawnRectFields,
  /** The box the contents are laid out in, before the turn: `rect` with its sides swapped under 90 and 270. */
  box: field.data(PdfRectSchema).space('box').optional(),
  /** Degrees clockwise, a quarter turn, about the middle of `box`; `null` upright. */
  rotation: field.data(PdfRotationSchema).nullable().optional(),
};

// ── families ──

export const textMarkupFields = {
  ...annotationBaseFields,
  ...colorStyleFields,
  /** The box around the quads. */
  ...drawnRectFields,
  quadPoints: field.data(z.array(PdfQuadSchema).min(1)).space('quads'),
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
  vertices: field.data(z.array(PdfPointSchema)).space('points'),
  ...pointsTurnFields,
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
  .optional()
  .space('measure');

/** Our caption on a polygon or polyline measurement; `null` when the shape has no caption flag. */
export const shapeCaptionFields = {
  captionEnabled: field.data(z.boolean()).nullable().optional(),
  /** `null` places the caption automatically. */
  captionCenter: field.data(PdfPointSchema).nullable().optional().space('point'),
};
