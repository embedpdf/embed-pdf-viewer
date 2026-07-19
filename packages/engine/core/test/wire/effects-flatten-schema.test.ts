import { describe, expect, test } from 'vitest';

import { FormEffectsResultSchema, PageFlattenResultSchema } from '../../src/wire/schemas';

describe('batch mutation wire schemas', () => {
  test('allows a true no-op effects batch without mutation metadata', () => {
    const result = { results: [], changedWidgets: [], meta: null };
    expect(FormEffectsResultSchema.parse(result)).toEqual(result);
  });

  test('preserves failed/skipped effect ordering', () => {
    const result = {
      results: [
        { index: 0, status: 'failed' as const, fields: [], changedWidgets: [] },
        { index: 1, status: 'skipped' as const, fields: [], changedWidgets: [] },
      ],
      changedWidgets: [],
      meta: { affectedPages: [], cacheDelta: null },
    };
    expect(FormEffectsResultSchema.parse(result)).toEqual(result);
  });

  test('keeps flatten request context self-describing for audit replay', () => {
    const result = {
      pageObjectNumbers: [12, 18],
      usage: 'print' as const,
      results: [
        { pageObjectNumber: 12, status: 'applied' as const },
        { pageObjectNumber: 18, status: 'unchanged' as const },
      ],
      meta: { affectedPages: [], cacheDelta: null },
    };
    expect(PageFlattenResultSchema.parse(result)).toEqual(result);
  });
});
