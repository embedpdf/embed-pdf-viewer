import { describe, expect, test } from 'vitest';

import { PageFlattenResultSchema } from '../../src/wire/schemas';

describe('flatten wire schema', () => {
  test('keeps flatten request context self-describing for audit replay', () => {
    const result = {
      pages: [
        { kind: 'objectNumber', objectNumber: 12 },
        { kind: 'objectNumber', objectNumber: 18 },
      ],
      usage: 'print' as const,
      results: [
        { page: { kind: 'objectNumber', objectNumber: 12 }, status: 'applied' as const },
        { page: { kind: 'objectNumber', objectNumber: 18 }, status: 'unchanged' as const },
      ],
      meta: { affectedPages: [], cacheDelta: null, opId: 'op-1', undoable: false },
    };
    expect(PageFlattenResultSchema.parse(result)).toEqual(result);
  });
});
