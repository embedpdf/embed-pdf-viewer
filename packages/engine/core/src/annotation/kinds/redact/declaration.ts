import { z } from 'zod';

import { PdfQuadSchema } from '../../../geometry/schemas';
import { ColorSchema, StandardFontSchema, TextAlignmentSchema } from '../../base.schema';
import { defineKind, field } from '../../declaration';
import { annotationBaseFields, colorStyleFields, FontNameSchema } from '../shared-fields';

export const RedactDeclaration = defineKind('redact', {
  ...annotationBaseFields,
  ...colorStyleFields,
  quadPoints: field.data(z.array(PdfQuadSchema)).optional(),
  interiorColor: field.data(ColorSchema).nullable().optional(),
  overlayText: field.data(z.string()).nullable().optional(),
  repeat: field.data(z.boolean()).optional(),
  fontFamily: field.data(StandardFontSchema).writes(FontNameSchema).optional(),
  /** `0` fits the label to the region. */
  fontSize: field.data(z.number().nonnegative()).optional(),
  fontColor: field.data(ColorSchema).optional(),
  textAlign: field.data(TextAlignmentSchema).optional(),
});
