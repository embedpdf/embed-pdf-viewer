import { z } from 'zod';

import { defineKind, field } from '../../declaration';
import { annotationBaseFields, rotationFields } from '../shared-fields';
import { StampFitSchema } from './values';

export const StampDeclaration = defineKind(
  'stamp',
  {
    ...annotationBaseFields,
    ...rotationFields,
    /** `/Name`: the stamp's label, such as `Approved`. */
    name: field.data(z.string()).nullable().optional(),
    /**
     * How the drawing is scaled into the box, and re-fit when the box changes
     * (`/EMBD_Metadata/AppearanceFit`). `null` when the PDF doesn't record it,
     * as for a stamp another tool made; the engine then fits with `'contain'`.
     * A create without it fits with `'contain'` and records that.
     */
    fit: field.data(StampFitSchema).nullable().optional(),
  },
  { appearance: 'required' },
);
