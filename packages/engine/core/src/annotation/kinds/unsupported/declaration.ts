import { z } from 'zod';

import { defineKind, field } from '../../declaration';
import { annotationBaseFields } from '../shared-fields';

/** An annotation of a type the engine doesn't model: only the shared fields are read. */
export const UnsupportedDeclaration = defineKind('unsupported', {
  ...annotationBaseFields,
  rawSubtypeCode: field.engine(z.number().int()),
  rawSubtypeName: field.engine(z.string()).nullable(),
});
