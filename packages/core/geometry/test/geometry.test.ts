import { describe, expect, it } from 'vitest';
import {
  applyPoint,
  displaySize,
  invert,
  rotateScaleMatrix,
  type PageRotation,
  type Size,
} from '../src/index';

const ROTATIONS: PageRotation[] = [0, 90, 180, 270];

describe('displaySize: w↔h swap for quarter-turns', () => {
  it('swaps for 90/270, keeps for 0/180', () => {
    const size: Size = { width: 600, height: 800 };
    expect(displaySize(size, 0)).toEqual({ width: 600, height: 800 });
    expect(displaySize(size, 90)).toEqual({ width: 800, height: 600 });
    expect(displaySize(size, 180)).toEqual({ width: 600, height: 800 });
    expect(displaySize(size, 270)).toEqual({ width: 800, height: 600 });
  });
});

/**
 * `rotateScaleMatrix` is the quarter-turn encoding — `pageTransform`,
 * `pageGeometry`, and `pageToWorld` all build on it. Pin the forward corner
 * placements (scale 1, content 600×800) so the four matrices stay correct, and
 * confirm `invert` is its exact inverse (the property that lets the forward
 * placement and the inverse hit-test share one source of truth).
 */
describe('rotateScaleMatrix: content point → rotated display box', () => {
  const boxW = 600;
  const boxH = 800;
  // content corners, top-left origin: TL, TR, BL, BR.
  const tl = { x: 0, y: 0 };
  const tr = { x: 600, y: 0 };
  const bl = { x: 0, y: 800 };
  const br = { x: 600, y: 800 };

  it('0°: identity placement', () => {
    const matrix = rotateScaleMatrix(1, boxW, boxH, 0);
    expect(applyPoint(matrix, tl)).toEqual({ x: 0, y: 0 });
    expect(applyPoint(matrix, br)).toEqual({ x: 600, y: 800 });
  });

  it('90°: content top-left lands at the display box top-right (footprint 800×600)', () => {
    const matrix = rotateScaleMatrix(1, boxW, boxH, 90);
    expect(applyPoint(matrix, tl)).toEqual({ x: 800, y: 0 });
    expect(applyPoint(matrix, bl)).toEqual({ x: 0, y: 0 });
    expect(applyPoint(matrix, br)).toEqual({ x: 0, y: 600 });
  });

  it('180°: corners flip through the box center', () => {
    const matrix = rotateScaleMatrix(1, boxW, boxH, 180);
    expect(applyPoint(matrix, tl)).toEqual({ x: 600, y: 800 });
    expect(applyPoint(matrix, br)).toEqual({ x: 0, y: 0 });
  });

  it('270°: content top-left lands at the display box bottom-left', () => {
    const matrix = rotateScaleMatrix(1, boxW, boxH, 270);
    expect(applyPoint(matrix, tl)).toEqual({ x: 0, y: 600 });
    expect(applyPoint(matrix, tr)).toEqual({ x: 0, y: 0 });
    expect(applyPoint(matrix, br)).toEqual({ x: 800, y: 0 });
  });

  it('folds scale in (a content point → scaled, rotated box offset)', () => {
    // scale 2: box extents in output units are 1200×1600.
    const matrix = rotateScaleMatrix(2, 1200, 1600, 90);
    expect(applyPoint(matrix, { x: 300, y: 400 })).toEqual({ x: 1600 - 800, y: 600 });
  });

  it('invert is its exact two-sided inverse at every rotation × scale', () => {
    for (const rotation of ROTATIONS) {
      for (const scale of [1, 2, 0.5, 1.37]) {
        const matrix = rotateScaleMatrix(scale, 600 * scale, 800 * scale, rotation);
        const inv = invert(matrix);
        for (const point of [tl, tr, bl, br, { x: 137, y: 211 }]) {
          const back = applyPoint(inv, applyPoint(matrix, point));
          expect(back.x).toBeCloseTo(point.x, 6);
          expect(back.y).toBeCloseTo(point.y, 6);
        }
      }
    }
  });
});
