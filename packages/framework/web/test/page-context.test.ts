import { describe, expect, it } from 'vitest';

import { livePageContext, makePageContext, pageClientSpace } from '../src/page-context';

/**
 * The rotation and scale math is the page transform's, tested in `@embedpdf/core-geometry`.
 * Here only the wiring: a client point becomes a box-local point (client minus the box's
 * top-left) handed to the transform, and back, against the box as it is when a conversion runs.
 */

/** A transform that scales by 2 and moves nothing else: enough to see what it was handed. */
const transform = {
  viewToPage: (point: { x: number; y: number }) => ({ x: point.x / 2, y: point.y / 2 }),
  pageToView: (point: { x: number; y: number }) => ({ x: point.x * 2, y: point.y * 2 }),
  pageToViewRect: (rect: { x: number; y: number; width: number; height: number }) => ({
    x: rect.x * 2,
    y: rect.y * 2,
    width: rect.width * 2,
    height: rect.height * 2,
  }),
};
const page = { kind: 'objectNumber' as const, objectNumber: 1 };
const NO_FRAME = { top: 0, right: 0, bottom: 0, left: 0 };

describe('pageClientSpace', () => {
  it('converts against the box and the transform as they are when a conversion runs', () => {
    let box = { left: 10, top: 20 };
    const space = pageClientSpace(
      () => transform,
      () => box,
    );
    expect(space.toPagePoint(10, 20)).toEqual({ x: 0, y: 0 });
    expect(space.toPagePoint(110, 220)).toEqual({ x: 50, y: 100 });
    box = { left: 30, top: 40 };
    expect(space.toClientPoint({ x: 50, y: 100 })).toEqual({ x: 130, y: 240 });
    expect(space.toClientRect({ x: 1, y: 2, width: 3, height: 4 })).toEqual({
      x: 32,
      y: 44,
      width: 6,
      height: 8,
    });
  });
});

describe('makePageContext', () => {
  it('carries what it was given and converts through the transform', () => {
    const frame = { top: 0, right: 0, bottom: 16, left: 0 };
    const demand = () => ({ desiredDeviceWidth: 100 });
    const context = makePageContext(
      'd',
      'view-1',
      page,
      3,
      frame,
      transform,
      () => ({ left: 10, top: 20 }),
      demand,
    );
    expect(context).toMatchObject({ documentId: 'd', view: 'view-1', ref: page, pageIndex: 3 });
    expect(context.frame).toBe(frame);
    expect(context.transform).toBe(transform);
    expect(context.getViewDemand).toBe(demand);
    expect(context.toPagePoint(110, 220)).toEqual({ x: 50, y: 100 });
    expect(context.toClientPoint({ x: 50, y: 100 })).toEqual({ x: 110, y: 220 });
  });

  it('has no view demand when the host gives none: the whole page', () => {
    const context = makePageContext('d', 'v', page, 0, NO_FRAME, transform, () => ({
      left: 0,
      top: 0,
    }));
    expect('getViewDemand' in context).toBe(false);
  });
});

describe('livePageContext', () => {
  it('is one object that answers from the current context', () => {
    let current = makePageContext('a', 'v', page, 0, NO_FRAME, transform, () => ({
      left: 0,
      top: 0,
    }));
    const live = livePageContext(() => current);
    expect(live.documentId).toBe('a');
    expect(live.toPagePoint(4, 4)).toEqual({ x: 2, y: 2 });
    const next = { kind: 'objectNumber' as const, objectNumber: 2 };
    current = makePageContext('b', 'v', next, 1, NO_FRAME, transform, () => ({ left: 4, top: 4 }));
    expect(live).toMatchObject({ documentId: 'b', ref: next, pageIndex: 1 });
    expect(live.toPagePoint(4, 4)).toEqual({ x: 0, y: 0 });
  });
});
