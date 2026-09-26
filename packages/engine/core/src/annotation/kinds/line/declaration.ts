import { z } from 'zod';

import { LineIntentSchema, LineLeaderSchema } from '../../../dto/Measure.schema';
import { LinePointsSchema } from '../../../geometry/schemas';
import { LineEndingsSchema } from '../../base.schema';
import { defineKind, field } from '../../declaration';
import { annotationBaseFields, filledStyleFields, measureField } from '../shared-fields';

export const LineDeclaration = defineKind('line', {
  ...annotationBaseFields,
  ...filledStyleFields,
  linePoints: field.data(LinePointsSchema),
  lineEndings: field.data(LineEndingsSchema).optional(),
  rotation: field.data(z.number()).nullable().optional(),
  intent: field.data(LineIntentSchema).nullable().optional(),
  measure: measureField,
  /** `/Cap`: paint `/Contents` on the line. */
  captionEnabled: field.data(z.boolean()).nullable().optional(),
  /** `/CP`. */
  captionPosition: field.data(z.enum(['inline', 'top'])).optional(),
  /** `/CO`, along the line and its normal; `null` is the normal position. */
  captionOffset: field
    .data(z.object({ along: z.number(), perpendicular: z.number() }))
    .nullable()
    .optional(),
  /** `/LL`, `/LLE` and `/LLO`. */
  leader: field.data(LineLeaderSchema).nullable().optional(),
});
