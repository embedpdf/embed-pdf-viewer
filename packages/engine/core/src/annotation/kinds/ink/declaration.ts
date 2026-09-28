import { InkListSchema } from '../../../geometry/schemas';
import { InkIntentSchema } from '../../base.schema';
import { defineKind, field } from '../../declaration';
import {
  annotationBaseFields,
  drawnRectFields,
  geometryStyleFields,
  pointsTurnFields,
} from '../shared-fields';

export const InkDeclaration = defineKind('ink', {
  ...annotationBaseFields,
  ...geometryStyleFields,
  ...drawnRectFields,
  inkList: field.data(InkListSchema).space('strokes'),
  intent: field.data(InkIntentSchema).nullable().optional(),
  ...pointsTurnFields,
});
