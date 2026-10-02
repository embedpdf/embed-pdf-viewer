/**
 * The page context's wiring. The rotation and scale math is covered by `pageTransform`'s own
 * tests in `@embedpdf/core-geometry`; here only what the adapter adds: a client point becomes a
 * point in the page's box (client − the box's top-left) for `transform.viewToPage`, and the
 * inverse goes through the same box.
 */
import { signal } from '@angular/core';
import { describe, expect, it } from 'vitest';
import { pageTransform } from '@embedpdf/core-geometry';
import { toPageRef } from '@embedpdf/core';
import { createPageContext } from '@embedpdf/angular/runtime';

const rectAt = (left: number, top: number, width: number, height: number) => () =>
  ({
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    x: left,
    y: top,
    toJSON() {},
  }) as DOMRect;

const contextFor = (rotation: 0 | 90 | 180 | 270, getRect: () => DOMRect) => {
  const transform = pageTransform({
    pageSize: { width: 100, height: 200 },
    rotation,
    scale: 2,
    dpr: 1,
  });
  return createPageContext({
    documentId: () => 'd',
    ref: () => toPageRef(1),
    view: () => 'test-view',
    pageIndex: signal(0),
    frame: signal({ top: 0, right: 0, bottom: 0, left: 0 }),
    transform: signal(transform),
    getRect,
  });
};

describe('createPageContext', () => {
  it('toPagePoint is transform.viewToPage of the point in the page’s box', () => {
    const page = contextFor(0, rectAt(50, 30, 200, 400));
    expect(page.toPagePoint(50 + 20, 30 + 40)).toEqual({ x: 10, y: 20 });
  });

  it('toClientPoint is its exact inverse, under rotation too', () => {
    for (const rotation of [0, 90, 180, 270] as const) {
      const page = contextFor(rotation, rectAt(10, 20, 400, 400));
      const point = { x: 30, y: 70 };
      const client = page.toClientPoint(point);
      const back = page.toPagePoint(client.x, client.y);
      expect(back.x).toBeCloseTo(point.x);
      expect(back.y).toBeCloseTo(point.y);
    }
  });

  it('carries the page’s identity and view, and toClientRect offsets the view rect', () => {
    const page = contextFor(0, rectAt(5, 7, 200, 400));
    expect(page.documentId).toBe('d');
    expect(page.ref).toEqual(toPageRef(1));
    expect(page.view).toBe('test-view');
    expect(page.toClientRect({ x: 10, y: 10, width: 5, height: 5 })).toEqual({
      x: 25,
      y: 27,
      width: 10,
      height: 10,
    });
  });
});
