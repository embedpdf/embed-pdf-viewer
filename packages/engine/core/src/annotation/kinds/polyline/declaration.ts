import { z } from 'zod';

import { PolylineIntentSchema } from '../../../dto/Measure.schema';
import { PdfPointSchema } from '../../../geometry/schemas';
import { LineEndingsSchema } from '../../base.schema';
import { defineKind, field } from '../../declaration';
import { measureField, shapeCaptionFields, vertexFields } from '../shared-fields';

export const PolylineDeclaration = defineKind('polyline', {
  ...vertexFields,
  /** At least two points on a write; fewer draw nothing. */
  vertices: field
    .data(z.array(PdfPointSchema))
    .writes(z.array(PdfPointSchema).min(2))
    .readBack()
    .space('points'),
  ...shapeCaptionFields,
  intent: field.data(PolylineIntentSchema).nullable().optional(),
  measure: measureField,
  lineEndings: field.data(LineEndingsSchema).optional(),
});
