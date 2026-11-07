import { describe, expect, test } from 'vitest';

import { FontResolveRequestSchema } from '../../src/wire/schemas';

const accepts = (run: object) => FontResolveRequestSchema.safeParse({ runs: [run] }).success;

describe('font resolve wire schema', () => {
  test('a run names its font by fontFamily alone', () => {
    expect(accepts({ text: 'Hi', fontFamily: '"Noto Sans", sans-serif' })).toBe(true);
    expect(accepts({ text: 'Hi', fontFamily: 'Noto Sans', italic: true })).toBe(false);
  });

  test('or by family, weight and italic together', () => {
    expect(accepts({ text: 'Hi', family: 'helvetica', weight: 700, italic: false })).toBe(true);
    expect(accepts({ text: 'Hi', family: 'helvetica', weight: 700 })).toBe(false);
  });

  test('a run that names no font, or a field the run has no use for, is rejected', () => {
    expect(accepts({ text: 'Hi' })).toBe(false);
    expect(accepts({ text: 'Hi', fontFamily: 'Noto Sans', size: 12 })).toBe(false);
  });
});
