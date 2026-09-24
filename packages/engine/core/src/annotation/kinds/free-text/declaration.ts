import { z } from 'zod';

import { CalloutLineSchema } from '../../../geometry/schemas';
import {
  AnnotationBorderStyleSchema,
  ColorSchema,
  FreeTextIntentSchema,
  LineEndingSchema,
  PdfRectDifferencesSchema,
  TextAlignmentSchema,
} from '../../base.schema';
import { defineKind, field } from '../../declaration';
import { annotationBaseFields, FontNameSchema, rotationFields } from '../shared-fields';
import { RichTextDocumentInputSchema, RichTextDocumentSchema } from './values';

export const FreeTextDeclaration = defineKind('free-text', {
  ...annotationBaseFields,
  ...rotationFields,
  intent: field.data(FreeTextIntentSchema),
  fontFamily: field.data(FontNameSchema),
  fontSize: field.data(z.number().positive()),
  textAlign: field.data(TextAlignmentSchema),
  richText: field.data(RichTextDocumentSchema).writes(RichTextDocumentInputSchema).optional(),
  color: field.data(ColorSchema).optional(),
  fontColor: field.data(ColorSchema).nullable().optional(),
  interiorColor: field.data(ColorSchema).nullable().optional(),
  opacity: field.data(z.number().min(0).max(1)).optional(),
  strokeWidth: field.data(z.number().nonnegative()).optional(),
  borderStyle: field.data(AnnotationBorderStyleSchema).optional(),
  dashArray: field.data(z.array(z.number().nonnegative())).nullable().optional(),
  rectDifferences: field.data(PdfRectDifferencesSchema).nullable().optional(),
  calloutLine: field.data(CalloutLineSchema).nullable().optional(),
  lineEnding: field.data(LineEndingSchema).nullable().optional(),
});
