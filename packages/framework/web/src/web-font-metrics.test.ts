import { describe, expect, it } from 'vitest';

import { firstLineShiftFor, lineModelFor } from './web-font-metrics';

const measured: Record<string, { ascent: number; descent: number }> = {
  'Helvetica, Arial, sans-serif': { ascent: 0.905, descent: 0.212 }, // Chrome resolved Arial
  '"Courier New", Courier, monospace': { ascent: 0.833, descent: 0.3 },
  '"roboto", sans-serif': { ascent: 0.927, descent: 0.244 }, // the registered font's own hhea
};
const measure = (f: string) => measured[f] ?? null;

describe('lineModelFor', () => {
  it('uses the engine metrics for the standard families, whatever the browser substitutes', () => {
    expect(lineModelFor('Helvetica, Arial, sans-serif', measure)).toEqual({
      ascent: 0.83,
      descent: 0.17,
      lineHeight: 1.2,
    });
    expect(lineModelFor('"Times New Roman", Times, serif', measure).lineHeight).toBe(1.2);
    expect(lineModelFor('"Courier New", Courier, monospace', measure).ascent).toBe(0.627);
  });

  it('uses the face itself for a registered font: its hhea plus the 0.2 leading', () => {
    expect(lineModelFor('"roboto", sans-serif', measure)).toEqual({
      ascent: 0.927,
      descent: 0.244,
      lineHeight: 1.371,
    });
  });

  it('falls back to a one-em Helvetica when nothing can be measured', () => {
    expect(lineModelFor('"unknown"', () => null).lineHeight).toBe(1.2);
  });
});

describe('firstLineShiftFor', () => {
  it('is the half-leading plus the browser/engine ascent gap, in px', () => {
    // Arial under a 1.2 line height at 100 px: CSS baseline = (1.2 − 1.117)/2
    // + 0.905 = 0.9465 em; the engine's Helvetica baseline = 0.83 em.
    expect(firstLineShiftFor('Helvetica, Arial, sans-serif', 100, measure)).toBeCloseTo(11.65, 2);
    // Courier New's box is far taller than the engine's Courier ascent.
    expect(firstLineShiftFor('"Courier New", Courier, monospace', 100, measure)).toBeCloseTo(
      ((1.2 - 1.133) / 2 + 0.833 - 0.627) * 100,
      1,
    );
  });

  it('reduces to the half-leading for a registered font (same metrics on both sides)', () => {
    expect(firstLineShiftFor('"roboto", sans-serif', 100, measure)).toBeCloseTo(10, 2); // 0.2 / 2 em
  });

  it('assumes a one-em content area when nothing can be measured', () => {
    expect(firstLineShiftFor('x', 100, () => null)).toBeCloseTo(10, 2);
  });
});
