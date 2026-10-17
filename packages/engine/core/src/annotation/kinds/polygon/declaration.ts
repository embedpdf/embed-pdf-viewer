import { z } from 'zod';

import { PolygonIntentSchema } from '../../../dto/Measure.schema';
import { PdfPointSchema } from '../../../geometry/schemas';
import { defineKind, field } from '../../declaration';
import { measureField, shapeCaptionFields, vertexFields } from '../shared-fields';

export const PolygonDeclaration = defineKind('polygon', {
  ...vertexFields,
  /** At least three points on a write; fewer enclose nothing. */
  vertices: field
    .data(z.array(PdfPointSchema))
    .writes(z.array(PdfPointSchema).min(3))
    .readBack()
    .space('points'),
  ...shapeCaptionFields,
  intent: field.data(PolygonIntentSchema).nullable().optional(),
  measure: measureField,
  cloudyIntensity: field.data(z.number().positive()).nullable().optional(),
});
