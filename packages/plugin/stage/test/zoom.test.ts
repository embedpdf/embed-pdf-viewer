import { describe, expect, it } from 'vitest';
import { toPageRef } from '@embedpdf/core';

import { placedStage } from './harness';

// The harness: 600 × 800 pages in a 1000 × 700 view with the default 24px
// padding, so 'automatic' rests at 100% and fit-width is 952 / 600.
const FIT_WIDTH = 952 / 600;

/** The levels a run of presses lands on. */
const presses = (step: () => void, read: () => number, count: number): number[] =>
  Array.from({ length: count }, () => {
    step();
    return read();
  });
/** Levels equal to float precision (a step from 3/4 to 2/3 can land one ulp off). */
const expectLevels = (actual: number[], expected: number[]) => {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((level, index) => expect(level).toBeCloseTo(expected[index], 9));
};

describe('zoomIn and zoomOut step through round levels', () => {
  it('from 100%: 125%, 150%, 200%, 300%, and back down the same way', () => {
    const { stage } = placedStage();
    expect(stage.getZoomLevel()).toBe(1);
    expectLevels(
      presses(
        () => stage.zoomIn(),
        () => stage.getZoomLevel(),
        4,
      ),
      [1.25, 1.5, 2, 3],
    );
    expectLevels(
      presses(
        () => stage.zoomOut(),
        () => stage.getZoomLevel(),
        4,
      ),
      [2, 1.5, 1.25, 1],
    );
  });

  it('from a level between two of them, to the next one', () => {
    const { stage } = placedStage();
    stage.fitWidth();
    expect(stage.getZoomLevel()).toBeCloseTo(FIT_WIDTH, 9); // 159%
    stage.zoomIn();
    expect(stage.getZoomLevel()).toBeCloseTo(2, 9);
    stage.fitWidth();
    stage.zoomOut();
    expect(stage.getZoomLevel()).toBeCloseTo(1.5, 9);
    stage.zoomTo(1.37);
    stage.zoomIn();
    expect(stage.getZoomLevel()).toBeCloseTo(1.5, 9);
  });

  it('past a round level within 5%, so every press visibly moves', () => {
    const { stage } = placedStage();
    stage.zoomTo(0.98);
    stage.zoomIn();
    expect(stage.getZoomLevel()).toBeCloseTo(1.25, 9);
    stage.zoomTo(1.03);
    stage.zoomOut();
    expect(stage.getZoomLevel()).toBeCloseTo(0.75, 9);
  });

  it('records the level it lands on as the zoom', () => {
    const { stage } = placedStage();
    stage.zoomIn();
    expect(stage.getZoomMode()).toBe('custom');
    expect(stage.getSettings().zoom).toEqual({ level: 1.25 });
  });

  it('stop at 5% and 6400%, where canZoomOut and canZoomIn turn false', () => {
    const { stage } = placedStage();
    expect(stage.canZoomIn()).toBe(true);
    expect(stage.canZoomOut()).toBe(true);
    stage.zoomTo(48);
    stage.zoomIn();
    expect(stage.getZoomLevel()).toBe(64);
    expect(stage.canZoomIn()).toBe(false);
    stage.zoomIn();
    expect(stage.getZoomLevel()).toBe(64);
    stage.zoomTo(0.1);
    stage.zoomOut();
    expect(stage.getZoomLevel()).toBe(0.05);
    expect(stage.canZoomOut()).toBe(false);
  });
});

describe('minZoom and maxZoom', () => {
  it('stop the buttons at the limit, even between round levels', () => {
    const { stage } = placedStage(5, { minZoom: 0.3, maxZoom: 2.5 });
    expectLevels(
      presses(
        () => stage.zoomIn(),
        () => stage.getZoomLevel(),
        5,
      ),
      [1.25, 1.5, 2, 2.5, 2.5],
    );
    expect(stage.canZoomIn()).toBe(false);
    expectLevels(
      presses(
        () => stage.zoomOut(),
        () => stage.getZoomLevel(),
        7,
      ),
      [2, 1.5, 1.25, 1, 0.75, 2 / 3, 0.5],
    );
    expectLevels(
      presses(
        () => stage.zoomOut(),
        () => stage.getZoomLevel(),
        3,
      ),
      [1 / 3, 0.3, 0.3],
    );
    expect(stage.canZoomOut()).toBe(false);
    expect(stage.canZoomIn()).toBe(true);
  });

  it('hold every other way of zooming too', () => {
    const { stage } = placedStage(5, { maxZoom: 2.5 });
    stage.zoomTo(10);
    expect(stage.getZoomLevel()).toBe(2.5);
    stage.zoomTo(1);
    stage.zoomBy(4);
    expect(stage.getZoomLevel()).toBe(2.5);
    stage.zoomTo(1);
    stage.zoomAround({ x: 500, y: 350 }, 8); // a pinch or Ctrl+wheel
    expect(stage.getZoomLevel()).toBe(2.5);
    stage.setCamera({ x: 0, y: 0, zoom: 10 });
    expect(stage.getZoomLevel()).toBe(2.5);
    stage.reveal(toPageRef(2), {
      rect: { x: 10, y: 10, width: 20, height: 20 },
      zoom: 'fit',
      behavior: 'instant',
    });
    expect(stage.getZoomLevel()).toBe(2.5);
    stage.goToDestination({ kind: 'xyz', page: toPageRef(3), x: 0, y: 0, zoom: 12 });
    expect(stage.getZoomLevel()).toBe(2.5);
  });

  it('win over a fit mode, which stops at the limit', () => {
    const above = placedStage(5, { minZoom: 2 }).stage;
    above.fitWidth();
    expect(above.getZoomMode()).toBe('fit-width');
    expect(above.getZoomLevel()).toBe(2);
    const below = placedStage(5, { maxZoom: 1.2 }).stage;
    below.fitWidth();
    expect(below.getZoomLevel()).toBe(1.2);
    below.fitAutomatic();
    expect(below.getZoomLevel()).toBe(1);
  });

  it('move the zoom when it falls outside new limits, and leave it alone inside them', () => {
    const { stage } = placedStage();
    stage.zoomTo(1.5);
    const camera = stage.getCamera();
    stage.updateSettings({ minZoom: 0.5, maxZoom: 4 });
    expect(stage.getCamera()).toEqual(camera);
    stage.updateSettings({ maxZoom: 1.25 });
    expect(stage.getZoomLevel()).toBe(1.25);
    stage.updateSettings({ minZoom: 2, maxZoom: 64 });
    expect(stage.getZoomLevel()).toBe(2);
  });

  it('keep a pinch inside them while the fingers move', () => {
    const { stage } = placedStage(5, { maxZoom: 2 });
    stage.beginGesture();
    stage.zoomAround({ x: 500, y: 350 }, 1.5);
    stage.zoomAround({ x: 500, y: 350 }, 1.5);
    expect(stage.getZoomLevel()).toBe(2);
    stage.endGesture();
    expect(stage.getSettings().zoom).toEqual({ level: 2 });
  });

  it('bound the double-tap ladder', () => {
    const { stage } = placedStage(5, { maxZoom: 1.2 });
    stage.doubleTapZoom({ x: 500, y: 350 });
    expect(stage.getZoomLevel()).toBeCloseTo(1.2, 9); // fit-width (159%) stops at the limit
    stage.doubleTapZoom({ x: 500, y: 350 });
    expect(stage.getZoomLevel()).toBeCloseTo(1, 9);
  });

  it('stay within 5% to 6400%, and a minZoom above maxZoom counts as maxZoom', () => {
    const wide = placedStage(5, { minZoom: 0, maxZoom: 1000 }).stage;
    wide.zoomTo(1000);
    expect(wide.getZoomLevel()).toBe(64);
    wide.zoomTo(0.001);
    expect(wide.getZoomLevel()).toBe(0.05);
    const crossed = placedStage(5, { minZoom: 3, maxZoom: 2 }).stage;
    crossed.zoomTo(5);
    expect(crossed.getZoomLevel()).toBe(2);
    crossed.zoomTo(0.5);
    expect(crossed.getZoomLevel()).toBe(2);
  });

  it('default to the full range', () => {
    const { stage } = placedStage();
    expect(stage.getSettings()).toMatchObject({ minZoom: 0.05, maxZoom: 64 });
  });
});
