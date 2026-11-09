import { z } from 'zod';

import { InkListSchema, PdfPointSchema } from '../../../geometry/schemas';
import { InkIntentSchema } from '../../base.schema';
import { defineKind, field } from '../../declaration';
import {
  markupBaseFields,
  drawnRectFields,
  geometryStyleFields,
  pointsTurnFields,
} from '../shared-fields';

export const InkDeclaration = defineKind(
  'ink',
  {
    ...markupBaseFields,
    ...geometryStyleFields,
    /** More than 0 on a write: ink has no fill, so a line of 0 draws nothing. */
    strokeWidth: field
      .data(z.number().nonnegative())
      .writes(z.number().positive())
      .readBack()
      .optional(),
    ...drawnRectFields,
    /** At least one stroke on a write, and no stroke without points. */
    inkList: field
      .data(InkListSchema)
      .writes(z.array(z.array(PdfPointSchema).min(1)).min(1))
      .readBack()
      .space('strokes'),
    intent: field.data(InkIntentSchema).nullable().optional(),
    ...pointsTurnFields,
  },
  // Optional: a one-page PDF drawn as the appearance in place of the
  // generator's straight segments (smoothed strokes, say).
  { appearance: 'optional' },
);
