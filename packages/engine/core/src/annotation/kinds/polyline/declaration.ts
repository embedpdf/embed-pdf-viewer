import { PolylineIntentSchema } from '../../../dto/Measure.schema';
import { LineEndingsSchema } from '../../base.schema';
import { defineKind, field } from '../../declaration';
import { measureField, shapeCaptionFields, vertexFields } from '../shared-fields';

export const PolylineDeclaration = defineKind('polyline', {
  ...vertexFields,
  ...shapeCaptionFields,
  intent: field.data(PolylineIntentSchema).nullable().optional(),
  measure: measureField,
  lineEndings: field.data(LineEndingsSchema).optional(),
});
