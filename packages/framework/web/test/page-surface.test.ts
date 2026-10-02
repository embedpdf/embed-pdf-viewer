import { describe, expect, it } from 'vitest';

import { pageSurfaceLayout, pageViewTransformInput, stagePageDemand } from '../src/page-surface';

const upright = {
  rotation: 0 as const,
  viewWidth: 100,
  viewHeight: 200,
  contentWidth: 100,
  contentHeight: 200,
};
// A quarter turn: the footprint swaps width and height, the content box keeps them.
const turned = {
  rotation: 90 as const,
  viewWidth: 200,
  viewHeight: 100,
  contentWidth: 100,
  contentHeight: 200,
};
const frame = { top: 10, right: 0, bottom: 20, left: 5 };

describe('pageSurfaceLayout', () => {
  it('puts the outer box one band out from the footprint, and the shadow at the footprint', () => {
    const layout = pageSurfaceLayout(upright, frame, { x: 50, y: 60 });
    expect(layout.outer).toEqual({ left: 45, top: 50, width: 105, height: 230 });
    expect(layout.shadow).toEqual({ left: 5, top: 10, width: 100, height: 200 });
    expect(layout.content).toEqual({ left: 5, top: 10, width: 100, height: 200 });
    expect(layout.turn).toBeNull();
  });

  it('centres a turned content box on the footprint and turns it about its centre', () => {
    const layout = pageSurfaceLayout(turned, frame);
    expect(layout.outer).toEqual({ left: 0, top: 0, width: 205, height: 130 });
    expect(layout.shadow).toEqual({ left: 5, top: 10, width: 200, height: 100 });
    expect(layout.content).toEqual({ left: 55, top: -40, width: 100, height: 200 });
    expect(layout.turn).toBe('rotate(90deg)');
  });
});

describe('stagePageDemand', () => {
  const visibleRect = { x: 0, y: 10, width: 100, height: 50 };
  const stage = {
    listVisiblePages: () => [
      { ref: { objectNumber: 7 }, transform: { deviceWidth: 640 }, visibleRect },
    ],
  };

  it("is the visible part at the page's device width while the page is on screen", () => {
    expect(stagePageDemand(stage, 7, 320)).toEqual({ desiredDeviceWidth: 640, visibleRect });
  });

  it('wants nothing (a zero box) while the page is off screen', () => {
    expect(stagePageDemand(stage, 8, 320)).toEqual({
      desiredDeviceWidth: 320,
      visibleRect: { x: 0, y: 0, width: 0, height: 0 },
    });
  });
});

describe('pageViewTransformInput', () => {
  it('scales the page to the width asked for, with physical 100% as the base', () => {
    const page = { size: { width: 600, height: 800 }, rotation: 90 as const, userUnit: 2 };
    expect(pageViewTransformInput(page, 240, 2)).toEqual({
      pageSize: { width: 600, height: 800 },
      rotation: 90,
      scale: 0.4,
      baseScale: (96 / 72) * 2,
      dpr: 2,
    });
  });

  it('is a 1 × 1 placeholder before the page is known', () => {
    expect(pageViewTransformInput(null, 240, 1)).toEqual({
      pageSize: { width: 1, height: 1 },
      rotation: 0,
      scale: 1,
      baseScale: 96 / 72,
      dpr: 1,
    });
  });
});
