import { describe, expect, it } from 'vitest';

import {
  fitAnchoredRect,
  projectAnchoredTarget,
  type ViewProjector,
} from '../src/anchored-position';

/** A 400 × 300 view, and a 100 × 40 menu. */
const view = { x: 0, y: 0, width: 400, height: 300 };
const fit = { size: { width: 100, height: 40 }, view };
const gap = 8;

describe('fitAnchoredRect', () => {
  it('sits on the side asked for when there is room, by its top-left corner', () => {
    const box = { x: 150, y: 120, width: 100, height: 20 };
    expect(fitAnchoredRect(box, 'top', gap, fit)).toEqual({
      left: 150,
      top: 120 - gap - 40,
      transform: 'none',
      placement: 'top',
    });
    expect(fitAnchoredRect(box, 'right', gap, fit)).toMatchObject({
      left: 250 + gap,
      top: 130 - 20,
      placement: 'right',
    });
  });

  it('flips to the other side when the one asked for has no room', () => {
    const nearTop = { x: 150, y: 10, width: 100, height: 20 };
    expect(fitAnchoredRect(nearTop, 'top', gap, fit)).toMatchObject({
      top: 30 + gap,
      placement: 'bottom',
    });
    const nearRight = { x: 330, y: 120, width: 40, height: 20 };
    expect(fitAnchoredRect(nearRight, 'right', gap, fit)).toMatchObject({
      left: 330 - gap - 100,
      placement: 'left',
    });
  });

  it('takes the side with more room when neither fits, and stays inside the view', () => {
    const tall = { x: 150, y: 20, width: 100, height: 240 }; // 20 above, 40 below
    const position = fitAnchoredRect(tall, 'top', gap, fit);
    expect(position.placement).toBe('bottom');
    expect(position.top).toBe(300 - gap - 40);
  });

  it('moves along the other axis to stay inside the view', () => {
    const atLeftEdge = { x: 0, y: 120, width: 40, height: 20 };
    expect(fitAnchoredRect(atLeftEdge, 'top', gap, fit).left).toBe(gap);
    const atRightEdge = { x: 380, y: 120, width: 20, height: 20 };
    expect(fitAnchoredRect(atRightEdge, 'bottom', gap, fit).left).toBe(400 - gap - 100);
  });

  it('goes with its box once the box has left the view', () => {
    const scrolledAway = { x: 150, y: -200, width: 100, height: 20 };
    const position = fitAnchoredRect(scrolledAway, 'bottom', gap, fit);
    expect(position.top).toBe(-180 + gap);
  });
});

describe('projectAnchoredTarget', () => {
  const projector: ViewProjector = {
    space: 'overlay',
    toScreen: (_page, rect) => ({ ...rect, y: rect.y - 100 }),
    toScreenPoint: (_page, at) => at,
    viewEnv: () => null,
  };
  const anchor = {
    page: { kind: 'objectNumber' as const, objectNumber: 1 },
    bounds: { x: 150, y: 110, width: 100, height: 20 },
  };

  it('centres with a transform until the size is known, then fits', () => {
    expect(projectAnchoredTarget(projector, anchor, 'top', gap)).toMatchObject({
      transform: 'translate(-50%, -100%)',
      placement: 'top',
    });
    expect(projectAnchoredTarget(projector, anchor, 'top', gap, fit)).toMatchObject({
      transform: 'none',
      placement: 'bottom',
    });
  });
});
