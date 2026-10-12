import { describe, expect, test } from 'vitest';

import type { AnnotationDraft } from '../../src/annotation/kinds';
import { pdfResolveAnnotationDraft } from '../../src/annotation/resolve';
import { EngineErrorCode } from '../../src/errors/EngineErrorCode';
import { pdfQuarterTurnBox, quarterTurnOf } from '../../src/geometry/convert';
import type { PdfRect } from '../../src/geometry/primitives';
import type { PdfCoordinates } from '../../src/pageSpace/coordinates';

const rect = ([left, bottom, right, top]: number[]): PdfRect => ({ left, bottom, right, top });
const draft = (fields: Record<string, unknown>) =>
  ({ subtype: 'square', ...fields }) as unknown as AnnotationDraft<PdfCoordinates>;

describe('quarter turns', () => {
  test('quarterTurnOf takes any whole number of quarter turns, either way', () => {
    expect([0, 90, 180, 270, 360, -90, 450].map(quarterTurnOf)).toEqual([
      0, 90, 180, 270, 0, 270, 90,
    ]);
    expect(quarterTurnOf(45)).toBe(null);
  });

  test('pdfQuarterTurnBox swaps the sides about the middle under 90 and 270', () => {
    expect(pdfQuarterTurnBox(rect([20, 20, 44, 180]), 90)).toEqual(rect([-48, 88, 112, 112]));
    expect(pdfQuarterTurnBox(rect([20, 20, 44, 180]), 180)).toEqual(rect([20, 20, 44, 180]));
  });
});

describe('a box kind placed by its rect', () => {
  test('a rect with a quarter turn states the box; the rect is worked out again', () => {
    const resolved = pdfResolveAnnotationDraft(
      draft({ rect: rect([20, 20, 44, 180]), rotation: 270 }),
    );
    expect(resolved).toMatchObject({ box: rect([-48, 88, 112, 112]), rotation: 270 });
    expect(resolved).not.toHaveProperty('rect');
  });

  test('a box, when given, is the shape: a read sent back as a create keeps its box', () => {
    const box = rect([0, 0, 100, 50]);
    const resolved = pdfResolveAnnotationDraft(
      draft({ box, rect: rect([0, 0, 10, 10]), rotation: 90 }),
    );
    expect(resolved).toMatchObject({ box });
  });

  test('a rect at another angle, or neither, is refused', () => {
    expect(() =>
      pdfResolveAnnotationDraft(draft({ rect: rect([0, 0, 40, 40]), rotation: 20 })),
    ).toThrow(
      expect.objectContaining({ code: EngineErrorCode.InvalidArg, details: { field: 'rect' } }),
    );
    expect(() => pdfResolveAnnotationDraft(draft({}))).toThrow(
      expect.objectContaining({ code: EngineErrorCode.InvalidArg, details: { field: 'box' } }),
    );
  });
});
