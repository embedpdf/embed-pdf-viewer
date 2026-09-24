import { describe, expect, test } from 'vitest';

import { ANNOTATION_FIELD_NAMES } from '../../src/annotation/field-names';
import { ANNOTATION_DECLARATIONS } from '../../src/annotation/kinds/declarations';

describe('ANNOTATION_FIELD_NAMES', () => {
  test.each(ANNOTATION_DECLARATIONS.map((declaration) => [declaration.subtype, declaration]))(
    'lists exactly the fields %s declares',
    (subtype, declaration) => {
      expect([...ANNOTATION_FIELD_NAMES[subtype as keyof typeof ANNOTATION_FIELD_NAMES]]).toEqual(
        Object.keys(declaration.fields),
      );
    },
  );
});
