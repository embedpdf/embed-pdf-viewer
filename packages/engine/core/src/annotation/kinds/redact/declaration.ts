import { z } from 'zod';

import { PdfQuadSchema, PdfRectSchema } from '../../../geometry/schemas';
import { ColorSchema, TextAlignmentSchema } from '../../base.schema';
import { defineKind, field } from '../../declaration';
import { annotationBaseFields, colorStyleFields, FontNameSchema } from '../shared-fields';

export const RedactDeclaration = defineKind('redact', {
  ...annotationBaseFields,
  ...colorStyleFields,
  /** Worked out from the quads when a create gives quads and no `rect`. */
  rect: field.data(PdfRectSchema).optional(),
  quadPoints: field.data(z.array(PdfQuadSchema)).optional(),
  interiorColor: field.data(ColorSchema).nullable().optional(),
  overlayText: field.data(z.string()).nullable().optional(),
  repeat: field.data(z.boolean()).optional(),
  /** A standard font or a registered key, as on free text. */
  fontFamily: field.data(FontNameSchema).optional(),
  /** `0` fits the label to the region. */
  fontSize: field.data(z.number().nonnegative()).optional(),
  fontColor: field.data(ColorSchema).optional(),
  textAlign: field.data(TextAlignmentSchema).optional(),
});
