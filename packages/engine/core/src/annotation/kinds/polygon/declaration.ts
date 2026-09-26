import { z } from 'zod';

import { PolygonIntentSchema } from '../../../dto/Measure.schema';
import { defineKind, field } from '../../declaration';
import { measureField, shapeCaptionFields, vertexFields } from '../shared-fields';

export const PolygonDeclaration = defineKind('polygon', {
  ...vertexFields,
  ...shapeCaptionFields,
  intent: field.data(PolygonIntentSchema).nullable().optional(),
  measure: measureField,
  cloudyIntensity: field.data(z.number().positive()).nullable().optional(),
});
