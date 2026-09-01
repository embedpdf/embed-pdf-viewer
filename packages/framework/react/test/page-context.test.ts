import { describe, expect, it } from 'vitest';
import { pageTransform } from '@embedpdf/core-geometry';
import { makePageContext } from '../src/runtime';

/**
 * The rotation/scale math is exhaustively covered in @embedpdf/core-geometry's
 * pageTransform tests. Here we only verify the adapter WIRING: `makePageContext`
 * turns a client point into a box-local point (client − the surface rect's
 * top-left) and feeds it to `transform.viewToContent`, and carries `transform` +
 * `frame` through.
 */
describe('makePageContext wiring', () => {
  const rectAt =
    (left: number, top: number, w: number, h: number): (() => DOMRect) =>
    () =>
      ({
        left,
        top,
        right: left + w,
        bottom: top + h,
        width: w,
        height: h,
        x: left,
        y: top,
        toJSON() {},
      }) as DOMRect;
  const NO_FRAME = { top: 0, right: 0, bottom: 0, left: 0 };

  it('toContentPoint = transform.viewToContent(client − rect top-left), scale 2', () => {
    const t = pageTransform({
      pageSize: { width: 100, height: 200 },
      rotation: 0,
      scale: 2,
      dpr: 1,
    });
    const ctx = makePageContext('d', 'test-view', 1, 0, NO_FRAME, t, rectAt(10, 20, t.viewWidth, t.viewHeight));
    expect(ctx.toContentPoint(10, 20)).toEqual({ x: 0, y: 0 }); // box top-left → page origin
    expect(ctx.toContentPoint(110, 220)).toEqual({ x: 50, y: 100 }); // (100,200) view px ÷ scale 2
  });

  it('inverts a 90° rotation through the transform', () => {
    const t = pageTransform({
      pageSize: { width: 100, height: 200 },
      rotation: 90,
      scale: 1,
      dpr: 1,
    });
    // footprint is 200×100; content top-left sits at the box top-RIGHT (x = 200)
    const ctx = makePageContext('d', 'test-view', 1, 0, NO_FRAME, t, rectAt(0, 0, t.viewWidth, t.viewHeight));
    const back = ctx.toContentPoint(200, 0);
    expect(back.x).toBeCloseTo(0, 4);
    expect(back.y).toBeCloseTo(0, 4);
  });

  it('toClientRect offsets the transform rect by the live client rect origin', () => {
    const t = pageTransform({
      pageSize: { width: 100, height: 200 },
      rotation: 90,
      scale: 1,
      dpr: 1,
    });
    const ctx = makePageContext('d', 'test-view', 1, 0, NO_FRAME, t, rectAt(30, 40, t.viewWidth, t.viewHeight));
    const rect = { x: 10, y: 20, width: 30, height: 40 };
    const view = t.contentToViewRect(rect);

    expect(ctx.toClientRect(rect)).toEqual({
      x: 30 + view.x,
      y: 40 + view.y,
      width: view.width,
      height: view.height,
    });
  });

  it('carries transform + frame through', () => {
    const frame = { top: 0, right: 0, bottom: 16, left: 0 };
    const t = pageTransform({ pageSize: { width: 10, height: 10 }, rotation: 0, scale: 1, dpr: 1 });
    const ctx = makePageContext('d', 'test-view', 1, 0, frame, t, rectAt(0, 0, 10, 10));
    expect(ctx.frame).toEqual(frame);
    expect(ctx.transform).toBe(t);
  });
});
