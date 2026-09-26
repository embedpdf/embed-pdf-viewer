import { describe, expect, test } from 'vitest';

import { FormEffectsResultSchema, PageFlattenResultSchema } from '../../src/wire/schemas';

describe('batch mutation wire schemas', () => {
  test('a no-op effects batch carries a meta that names nothing', () => {
    const result = {
      results: [],
      meta: { affectedPages: [], cacheDelta: null, changedFields: [], changedWidgets: [] },
    };
    expect(FormEffectsResultSchema.parse(result)).toEqual(result);
  });

  test('preserves failed/skipped effect ordering', () => {
    const result = {
      results: [
        { index: 0, status: 'failed' as const, fields: [], changedWidgets: [] },
        { index: 1, status: 'skipped' as const, fields: [], changedWidgets: [] },
      ],
      meta: { affectedPages: [], cacheDelta: null, changedFields: [], changedWidgets: [] },
    };
    expect(FormEffectsResultSchema.parse(result)).toEqual(result);
  });

  test('keeps flatten request context self-describing for audit replay', () => {
    const result = {
      pages: [
        { kind: 'objectNumber', pageObjectNumber: 12 },
        { kind: 'objectNumber', pageObjectNumber: 18 },
      ],
      usage: 'print' as const,
      results: [
        { page: { kind: 'objectNumber', pageObjectNumber: 12 }, status: 'applied' as const },
        { page: { kind: 'objectNumber', pageObjectNumber: 18 }, status: 'unchanged' as const },
      ],
      meta: { affectedPages: [], cacheDelta: null },
    };
    expect(PageFlattenResultSchema.parse(result)).toEqual(result);
  });
});
