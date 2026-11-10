import { z } from 'zod';

import {
  FreeTextAlignWriteSchema,
  RichTextAlignSchema,
  RichTextDocumentInputSchema,
  RichTextDocumentSchema,
} from '../../../dto/RichText.schema';
import { CalloutLineSchema } from '../../../geometry/schemas';
import {
  AnnotationBorderStyleSchema,
  ColorSchema,
  DashArrayWriteSchema,
  DrawnBorderStyleSchema,
  FreeTextIntentSchema,
  FreeTextIntentWriteSchema,
  LineEndingSchema,
  VerticalAlignmentSchema,
} from '../../base.schema';
import { defineKind, field } from '../../declaration';
import { boxFields, FontNameSchema, markupBaseFields } from '../shared-fields';

export const FreeTextDeclaration = defineKind('free-text', {
  ...markupBaseFields,
  ...boxFields,
  /**
   * A create without it is a callout when it has a `calloutLine`, else a
   * plain box. A typewriter another app made is kept as it is.
   */
  intent: field.data(FreeTextIntentSchema).writes(FreeTextIntentWriteSchema).readBack().optional(),
  /** The text's font: the rich text body's. Helvetica when a create leaves it out. */
  fontFamily: field.data(FontNameSchema).optional(),
  /** The body's size in points: 12 when a create leaves it out. */
  fontSize: field.data(z.number().positive()).optional(),
  /**
   * The body's alignment: left when a create leaves it out. A write may say
   * `'auto'`: right-aligned right-to-left when the text's first strong
   * character is right-to-left (Hebrew, Arabic...), else left-aligned.
   */
  textAlign: field.data(RichTextAlignSchema).writes(FreeTextAlignWriteSchema).optional(),
  /** Where the lines sit in the box: top when a create leaves it out. */
  verticalAlign: field.data(VerticalAlignmentSchema).optional(),
  richText: field
    .data(RichTextDocumentSchema)
    .writes(RichTextDocumentInputSchema)
    .optional()
    .space('length'),
  /** The border's color, and a callout line's. */
  color: field.data(ColorSchema).optional(),
  /** The text's color: the rich text body's. Black when a create leaves it out. */
  fontColor: field.data(ColorSchema).optional(),
  interiorColor: field.data(ColorSchema).nullable().optional(),
  opacity: field.data(z.number().min(0).max(1)).optional(),
  strokeWidth: field.data(z.number().nonnegative()).optional(),
  borderStyle: field
    .data(AnnotationBorderStyleSchema)
    .writes(DrawnBorderStyleSchema)
    .readBack()
    .optional(),
  dashArray: field
    .data(z.array(z.number().nonnegative()))
    .writes(DashArrayWriteSchema)
    .nullable()
    .optional(),
  cloudyIntensity: field.data(z.number().positive()).nullable().optional(),
  calloutLine: field.data(CalloutLineSchema).nullable().optional().space('calloutLine'),
  lineEnding: field.data(LineEndingSchema).nullable().optional(),
});
