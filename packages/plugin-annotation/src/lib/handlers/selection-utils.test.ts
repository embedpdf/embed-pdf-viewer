import {
  getQuadBaselineEnd,
  getRectBottomCenter,
  orientedQuadFromPageBoxAndMatrix,
  quadToRect,
  rectToQuad,
} from '@embedpdf/models';
import { computeCaretGeometry } from './selection-utils';

describe('computeCaretGeometry', () => {
  test('uses true ink height and baseline anchor for horizontal text', () => {
    const segmentRect = { origin: { x: 0, y: 0 }, size: { width: 20, height: 12 } };
    const segmentQuad = rectToQuad(segmentRect);
    const geometry = computeCaretGeometry(segmentRect, segmentQuad);
    const baselineEnd = getQuadBaselineEnd(segmentQuad);

    expect(geometry.rotation).toBeUndefined();
    expect(geometry.unrotatedRect).toBeUndefined();
    expect(geometry.rect.size).toEqual({ width: 6, height: 6 });
    expect(getRectBottomCenter(geometry.rect)).toEqual(baselineEnd);
  });

  test('derives rotation and AABB for vertically oriented text', () => {
    const segmentQuad = orientedQuadFromPageBoxAndMatrix(0, 20, 10, 0, {
      a: 0,
      b: 1,
      c: -1,
      d: 0,
      e: 0,
      f: 0,
    });
    const segmentRect = quadToRect(segmentQuad);
    const geometry = computeCaretGeometry(segmentRect, segmentQuad);
    const baselineEnd = getQuadBaselineEnd(segmentQuad);

    expect(geometry.rotation).toBeCloseTo(90, 5);
    expect(geometry.unrotatedRect?.size).toEqual({ width: 5, height: 5 });
    expect(getRectBottomCenter(geometry.unrotatedRect!)).toEqual(baselineEnd);
    expect(geometry.rect.size.width).toBeGreaterThan(geometry.unrotatedRect!.size.width);
    expect(geometry.rect.size.height).toBeGreaterThan(geometry.unrotatedRect!.size.height);
  });

  test('falls back to axis-aligned quad when segment quads are missing', () => {
    const segmentRect = { origin: { x: 5, y: 8 }, size: { width: 12, height: 4 } };
    const geometry = computeCaretGeometry(segmentRect);

    expect(geometry.rect.size).toEqual({ width: 2, height: 2 });
    expect(geometry.rotation).toBeUndefined();
  });
});
