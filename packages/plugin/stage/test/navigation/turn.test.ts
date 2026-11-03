import { manualClock } from '@embedpdf/core/testing';
import { describe, expect, it } from 'vitest';

import type { StageConfig } from '../../src/host-contract';
import { placedStage } from '../harness';

// The harness's pages are 600 × 800 in a 1000 × 700 viewport. Fit-page shows a
// whole page, so it sits at every edge; the automatic zoom (100%) fits the
// width and scrolls down a tall page.
const FITS: StageConfig = { flow: 'paged', zoom: { mode: 'fit-page' } };
const TALL: StageConfig = { flow: 'paged' };

/** Wait out the pause that ends a wheel stream. */
const PAUSE_MS = 250;

function pagedStage(config: StageConfig) {
  const time = manualClock();
  const { stage } = placedStage(3, config, time.clock);
  const atTop = () => stage.getScrollMetrics().scrollTop <= 0.5;
  const atBottom = () => {
    const metrics = stage.getScrollMetrics();
    return metrics.scrollTop + metrics.clientHeight >= metrics.scrollHeight - 0.5;
  };
  return { stage, time, atTop, atBottom };
}

describe('wheel and trackpad', () => {
  it('a push past the bottom turns once; the rest of its stream moves nothing', () => {
    const { stage, time } = pagedStage(FITS);
    stage.panBy(0, -100); // a wheel notch down
    expect(stage.getCurrentPageIndex()).toBe(1);

    stage.panBy(0, -100); // its momentum
    expect(stage.getCurrentPageIndex()).toBe(1);

    time.advance(PAUSE_MS);
    stage.panBy(0, -100); // a new stream
    expect(stage.getCurrentPageIndex()).toBe(2);
  });

  it('small pushes add up within one stream', () => {
    const { stage } = pagedStage(FITS);
    stage.panBy(0, -30);
    expect(stage.getCurrentPageIndex()).toBe(0);
    stage.panBy(0, -40);
    expect(stage.getCurrentPageIndex()).toBe(1);
  });

  it('reading down a tall page stops at its bottom, and the next push turns to the top of the next', () => {
    const { stage, time, atTop, atBottom } = pagedStage(TALL);
    for (let notch = 0; notch < 20; notch++) stage.panBy(0, -100);
    expect(stage.getCurrentPageIndex()).toBe(0);
    expect(atBottom()).toBe(true);

    time.advance(PAUSE_MS);
    stage.panBy(0, -100);
    expect(stage.getCurrentPageIndex()).toBe(1);
    expect(atTop()).toBe(true);
  });

  it('a push past the top goes back to the bottom of the previous page', () => {
    const { stage, time, atBottom } = pagedStage(TALL);
    stage.goToPage(1, { behavior: 'instant' });
    stage.panBy(0, 100); // a wheel notch up
    expect(stage.getCurrentPageIndex()).toBe(0);
    expect(atBottom()).toBe(true);

    time.advance(PAUSE_MS);
    stage.panBy(0, 100); // at the first page there's nowhere to go
    expect(stage.getCurrentPageIndex()).toBe(0);
  });
});

describe('touch', () => {
  it('a drag past the edge turns the page when the finger lifts', () => {
    const { stage } = pagedStage(FITS);
    stage.beginGesture({ elastic: true });
    stage.panBy(0, -80);
    expect(stage.getCurrentPageIndex()).toBe(0);
    stage.endGesture();
    expect(stage.getCurrentPageIndex()).toBe(1);
  });

  it('a short drag springs back, and a flick turns', () => {
    const { stage } = pagedStage(FITS);
    stage.beginGesture({ elastic: true });
    stage.panBy(0, -20);
    stage.endGesture();
    expect(stage.getCurrentPageIndex()).toBe(0);

    stage.beginGesture({ elastic: true });
    stage.panBy(0, -20);
    stage.endGesture();
    stage.fling(0, -900);
    expect(stage.getCurrentPageIndex()).toBe(1);
    expect(stage.isMoving()).toBe(false); // no glide on the page that arrived
  });

  it('a sideways swipe turns a page that fits its width, the other way in right-to-left', () => {
    const ltr = pagedStage(TALL);
    ltr.stage.beginGesture({ elastic: true });
    ltr.stage.panBy(-80, 0); // the finger moves left
    ltr.stage.endGesture();
    expect(ltr.stage.getCurrentPageIndex()).toBe(1);

    const rtl = pagedStage({ ...TALL, direction: 'rtl' });
    rtl.stage.beginGesture({ elastic: true });
    rtl.stage.panBy(80, 0); // the finger moves right
    rtl.stage.endGesture();
    expect(rtl.stage.getCurrentPageIndex()).toBe(1);
  });

  it('a pinch never turns the page', () => {
    const { stage } = pagedStage(FITS);
    stage.beginGesture({ elastic: true });
    stage.zoomAround({ x: 500, y: 350 }, 0.9);
    stage.panBy(0, -200);
    stage.endGesture();
    stage.fling(0, -900);
    expect(stage.getCurrentPageIndex()).toBe(0);
  });
});

describe('turnGestures', () => {
  it('false leaves turning to nextPage() and previousPage()', () => {
    const { stage } = pagedStage({ ...FITS, turnGestures: false });
    stage.panBy(0, -100);
    stage.beginGesture({ elastic: true });
    stage.panBy(0, -200);
    stage.endGesture();
    stage.fling(0, -900);
    expect(stage.getCurrentPageIndex()).toBe(0);

    stage.nextPage();
    expect(stage.getCurrentPageIndex()).toBe(1);
  });

  it('continuous flow never turns: the next page is already there to scroll to', () => {
    const { stage } = pagedStage({ zoom: { mode: 'fit-page' } });
    stage.panBy(0, -100);
    expect(stage.getCurrentPageIndex()).toBe(0);
  });
});
