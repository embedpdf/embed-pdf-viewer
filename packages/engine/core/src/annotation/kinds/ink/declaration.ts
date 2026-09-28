import { z } from 'zod';

import { InkListSchema } from '../../../geometry/schemas';
import { InkIntentSchema } from '../../base.schema';
import { defineKind, field } from '../../declaration';
import { annotationBaseFields, geometryStyleFields } from '../shared-fields';

export const InkDeclaration = defineKind('ink', {
  ...annotationBaseFields,
  ...geometryStyleFields,
  inkList: field.data(InkListSchema),
  intent: field.data(InkIntentSchema).nullable().optional(),
  /** The angle already applied to the points, degrees clockwise. */
  rotation: field.data(z.number()).nullable().optional(),
});
