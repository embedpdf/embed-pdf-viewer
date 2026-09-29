import { describe, expect, it } from 'vitest';
import {
  angleOf,
  applyPoint,
  compose,
  identity,
  invert,
  rotate,
  rotateAbout,
  scale,
  scaleAbout,
  translate,
  type PointIn,
} from '../src/index';

const pagePoint = (x: number, y: number): PointIn<'page'> => ({ x, y }) as PointIn<'page'>;
const near = (left: number, right: number, eps = 1e-9) =>
  expect(Math.abs(left - right)).toBeLessThan(eps);

describe('same-space affine builders', () => {
  it('translate moves a point', () => {
    const point = applyPoint(translate<'page'>(5, -3), pagePoint(1, 2));
    expect(point).toEqual({ x: 6, y: -1 });
  });

  it('scale scales about the origin', () => {
    const point = applyPoint(scale<'page'>(2, 3), pagePoint(4, 5));
    expect(point).toEqual({ x: 8, y: 15 });
  });

  it('rotate(90deg) turns clockwise in y-down space', () => {
    // CW in y-down: +x axis (1,0) → +y axis (0,1).
    const point = applyPoint(rotate<'page'>(Math.PI / 2), pagePoint(1, 0));
    near(point.x, 0);
    near(point.y, 1);
  });

  it('rotateAbout leaves the pivot fixed', () => {
    const point = pagePoint(10, 20);
    const mapped = applyPoint(rotateAbout(point, 1.2345), point);
    near(mapped.x, 10);
    near(mapped.y, 20);
  });

  it('scaleAbout leaves the anchor fixed and scales offsets', () => {
    const point = pagePoint(10, 10);
    const matrix = scaleAbout(point, 2, 2);
    expect(applyPoint(matrix, point)).toEqual({ x: 10, y: 10 });
    const mapped = applyPoint(matrix, pagePoint(12, 10));
    expect(mapped).toEqual({ x: 14, y: 10 });
  });

  it('angleOf recovers a rotation angle', () => {
    near(angleOf(rotate<'page'>(0.7)), 0.7);
    near(angleOf(rotateAbout(pagePoint(3, 4), 0.7)), 0.7);
  });

  it('rotate is invertible and composes additively', () => {
    const matrix = compose(rotate<'page'>(0.3), rotate<'page'>(0.4));
    near(angleOf(matrix), 0.7);
    const back = compose(invert(matrix), matrix);
    const [a, b, c, d, e, f] = back;
    const [ia, ib, ic, id, ie, iff] = identity<'page'>();
    near(a, ia);
    near(b, ib);
    near(c, ic);
    near(d, id);
    near(e, ie);
    near(f, iff);
  });
});
