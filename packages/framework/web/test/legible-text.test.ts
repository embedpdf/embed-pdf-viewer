import { describe, expect, it } from 'vitest';

import { LEGIBLE_FONT_PX, legibleScaleOf, legibleShrinkOf } from '../src/legible-text';

describe('legibleScaleOf', () => {
  it('is how many times bigger text must be laid out to reach 16 px', () => {
    expect(LEGIBLE_FONT_PX).toBe(16);
    expect(legibleScaleOf(8)).toBe(2);
    expect(legibleScaleOf(6.4)).toBe(2.5);
  });

  it('is 1 for text that is legible already, or has no size', () => {
    expect(legibleScaleOf(16)).toBe(1);
    expect(legibleScaleOf(24)).toBe(1);
    expect(legibleScaleOf(0)).toBe(1);
  });
});

describe('legibleShrinkOf', () => {
  it('draws what is laid out bigger back at its size, and nothing at its size', () => {
    expect(legibleShrinkOf(2)).toBe('scale(0.5)');
    expect(legibleShrinkOf(1)).toBeNull();
  });
});
