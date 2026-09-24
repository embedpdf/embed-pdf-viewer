import { z } from 'zod';

import { defineKind, field } from '../../declaration';
import { annotationBaseFields, rotationFields } from '../shared-fields';

export const StampDeclaration = defineKind(
  'stamp',
  {
    ...annotationBaseFields,
    ...rotationFields,
    /** `/Name`: the stamp's label, such as `Approved`. */
    name: field.data(z.string()).nullable().optional(),
  },
  { appearance: 'required' },
);
