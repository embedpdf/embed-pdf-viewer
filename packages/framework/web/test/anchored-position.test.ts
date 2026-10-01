import { describe, expect, it } from 'vitest';

import {
  fitAnchoredRect,
  positionAnchoredRect,
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

  it('keeps its alignment when it flips', () => {
    const nearTop = { x: 150, y: 10, width: 100, height: 20 };
    expect(fitAnchoredRect(nearTop, 'top-end', gap, fit)).toEqual({
      left: 250 - 100, // right edges lined up
      top: 30 + gap,
      transform: 'none',
      placement: 'bottom-end',
    });
  });
});

describe('positionAnchoredRect', () => {
  const box = { x: 100, y: 100, width: 100, height: 40 };

  it('lines up with the start or the end of the side', () => {
    expect(positionAnchoredRect(box, 'top-start', gap)).toEqual({
      left: 100,
      top: 100 - gap,
      transform: 'translate(0, -100%)',
      placement: 'top-start',
    });
    expect(positionAnchoredRect(box, 'top-end', gap)).toMatchObject({
      left: 200,
      transform: 'translate(-100%, -100%)',
    });
    expect(positionAnchoredRect(box, 'right-end', gap)).toMatchObject({
      left: 200 + gap,
      top: 140,
      transform: 'translate(0, -100%)',
    });
  });

  it('overlaps the box with a negative gap', () => {
    // A badge on the top-right corner: its bottom edge 12px inside the box.
    expect(positionAnchoredRect(box, 'top-end', -12)).toMatchObject({ left: 200, top: 112 });
  });
});

describe('projectAnchoredTarget', () => {
  const projector: ViewProjector = {
    space: 'overlay',
    toScreen: (_page, rect) => ({ ...rect, y: rect.y - 100 }),
    toScreenPoint: (_page, at) => at,
    viewEnv: () => ({ scale: 2, rotation: 0, zoom: 2 }),
    view: () => view,
  };
  const page = { kind: 'objectNumber' as const, objectNumber: 1 };
  const anchor = { page, bounds: { x: 150, y: 110, width: 100, height: 20 } };

  it('centres with a transform until the size is known, then fits', () => {
    expect(projectAnchoredTarget(projector, anchor, { placement: 'top', gap })).toMatchObject({
      transform: 'translate(-50%, -100%)',
      placement: 'top',
    });
    expect(projectAnchoredTarget(projector, anchor, { placement: 'top', gap }, fit)).toMatchObject({
      transform: 'none',
      placement: 'bottom',
    });
  });

  it('stays where it is put when pinned: no flip, no move to stay in view', () => {
    // Too close to the top for a menu above it: a pinned one stays above anyway.
    expect(
      projectAnchoredTarget(projector, anchor, { placement: 'top', gap, pinned: true }, fit),
    ).toEqual({ left: 200, top: 10 - gap, transform: 'translate(-50%, -100%)', placement: 'top' });
  });

  it('shows nothing once its box is too far out of view to reach into it', () => {
    // 200px below the 300px view: further than a 100 × 40 menu and its gap reach.
    const below = { page, bounds: { x: 150, y: 100 + 300 + 200, width: 100, height: 20 } };
    expect(projectAnchoredTarget(projector, below, { placement: 'top', gap }, fit)).toBeNull();
    // Just below the view: a 40px menu above it still reaches in.
    const justBelow = { page, bounds: { x: 150, y: 100 + 300 + 20, width: 100, height: 20 } };
    expect(
      projectAnchoredTarget(projector, justBelow, { placement: 'top', gap }, fit),
    ).not.toBeNull();
  });

  it('asks a box that depends on the view where it is in this one', () => {
    const note = {
      page,
      bounds: { x: 150, y: 110, width: 20, height: 20 },
      boundsIn: (env: { zoom: number }) => ({
        x: 150,
        y: 110,
        width: 20 / env.zoom,
        height: 20 / env.zoom,
      }),
    };
    expect(projectAnchoredTarget(projector, note, { placement: 'right', gap: 0 })).toMatchObject({
      left: 160, // 150 + 20 / 2
    });
  });
});
