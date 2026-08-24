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

const P = (x: number, y: number): PointIn<'content'> => ({ x, y }) as PointIn<'content'>;
const near = (a: number, b: number, eps = 1e-9) => expect(Math.abs(a - b)).toBeLessThan(eps);

describe('same-space affine builders', () => {
  it('translate moves a point', () => {
    const p = applyPoint(translate<'content'>(5, -3), P(1, 2));
    expect(p).toEqual({ x: 6, y: -1 });
  });

  it('scale scales about the origin', () => {
    const p = applyPoint(scale<'content'>(2, 3), P(4, 5));
    expect(p).toEqual({ x: 8, y: 15 });
  });

  it('rotate(90deg) turns clockwise in y-down space', () => {
    // CW in y-down: +x axis (1,0) → +y axis (0,1).
    const p = applyPoint(rotate<'content'>(Math.PI / 2), P(1, 0));
    near(p.x, 0);
    near(p.y, 1);
  });

  it('rotateAbout leaves the pivot fixed', () => {
    const c = P(10, 20);
    const p = applyPoint(rotateAbout(c, 1.2345), c);
    near(p.x, 10);
    near(p.y, 20);
  });

  it('scaleAbout leaves the anchor fixed and scales offsets', () => {
    const a = P(10, 10);
    const m = scaleAbout(a, 2, 2);
    expect(applyPoint(m, a)).toEqual({ x: 10, y: 10 });
    const p = applyPoint(m, P(12, 10));
    expect(p).toEqual({ x: 14, y: 10 });
  });

  it('angleOf recovers a rotation angle', () => {
    near(angleOf(rotate<'content'>(0.7)), 0.7);
    near(angleOf(rotateAbout(P(3, 4), 0.7)), 0.7);
  });

  it('rotate is invertible and composes additively', () => {
    const r = compose(rotate<'content'>(0.3), rotate<'content'>(0.4));
    near(angleOf(r), 0.7);
    const back = compose(invert(r), r);
    const [a, b, c, d, e, f] = back;
    const [ia, ib, ic, id, ie, iff] = identity<'content'>();
    near(a, ia);
    near(b, ib);
    near(c, ic);
    near(d, id);
    near(e, ie);
    near(f, iff);
  });
});
