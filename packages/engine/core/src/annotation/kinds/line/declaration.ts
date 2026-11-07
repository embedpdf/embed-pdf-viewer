import { z } from 'zod';

import {
  LineIntentSchema,
  LineLeaderSchema,
  LineLeaderWriteSchema,
} from '../../../dto/Measure.schema';
import { LinePointsSchema } from '../../../geometry/schemas';
import { closed } from '../../../wire/reading';
import { LineEndingsSchema } from '../../base.schema';
import { defineKind, field } from '../../declaration';
import {
  markupBaseFields,
  drawnRectFields,
  filledStyleFields,
  measureField,
  pointsTurnFields,
} from '../shared-fields';

export const LineDeclaration = defineKind('line', {
  ...markupBaseFields,
  ...filledStyleFields,
  ...drawnRectFields,
  linePoints: field.data(LinePointsSchema).space('linePoints'),
  lineEndings: field.data(LineEndingsSchema).optional(),
  ...pointsTurnFields,
  intent: field.data(LineIntentSchema).nullable().optional(),
  measure: measureField,
  /** `/Cap`: paint `/Contents` on the line. A file without `/Cap` reads `false`, its default. */
  captionEnabled: field.data(z.boolean()).optional(),
  /** `/CP`. */
  captionPosition: field.data(closed(z.enum(['inline', 'top']))).optional(),
  /** `/CO`, along the line and its normal; `null` is the normal position. */
  captionOffset: field
    .data(z.object({ along: z.number(), perpendicular: z.number() }))
    .nullable()
    .optional(),
  /** `/LL`, `/LLE` and `/LLO`. */
  leader: field.data(LineLeaderSchema).writes(LineLeaderWriteSchema).nullable().optional(),
});
