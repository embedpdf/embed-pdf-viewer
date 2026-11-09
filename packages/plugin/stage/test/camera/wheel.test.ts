import { manualClock } from '@embedpdf/core/testing';
import { describe, expect, it } from 'vitest';

import type { StageConfig } from '../../src/host-contract';
import { placedStage } from '../harness';

// The harness's pages are 600 × 800 in a 1000 × 700 viewport: three of them
// scroll down, and fit the width with room to spare.

/** Wait out the pause that ends a wheel stream. */
const PAUSE_MS = 250;
/** A wheel notch down the document and one back up, signed like `panBy`. */
const DOWN = -100;
const UP = 100;

function wheelStage(config: StageConfig = {}, pages = 3) {
  const time = manualClock();
  const { stage } = placedStage(pages, config, time.clock);
  const scrollTop = () => stage.getScrollMetrics().scrollTop;
  const atBottom = () => {
    const metrics = stage.getScrollMetrics();
    return metrics.scrollTop + metrics.clientHeight >= metrics.scrollHeight - 0.5;
  };
  return { stage, time, scrollTop, atBottom };
}

describe('a wheel over the Stage', () => {
  it('pans the camera while there is somewhere to go', () => {
    const { stage, scrollTop } = wheelStage();
    expect(stage.wheelBy(0, DOWN)).toBe(true);
    expect(scrollTop()).toBe(100);
  });

  it('is left to the page when its stream begins at the end it pushes on', () => {
    const { stage, time, scrollTop } = wheelStage();
    expect(stage.wheelBy(0, UP)).toBe(false); // already at the top
    expect(scrollTop()).toBe(0);

    time.advance(PAUSE_MS);
    expect(stage.wheelBy(0, DOWN)).toBe(true); // the other way, there is room
    expect(scrollTop()).toBe(100);
  });

  it('stops at the end it reaches, momentum included; the next stream scrolls the page', () => {
    const { stage, time, atBottom } = wheelStage();
    for (let notch = 0; notch < 40; notch++) expect(stage.wheelBy(0, DOWN)).toBe(true);
    expect(atBottom()).toBe(true);

    time.advance(PAUSE_MS);
    expect(stage.wheelBy(0, DOWN)).toBe(false);
  });

  it("keeps a stream the page's when it turns back, until it pauses", () => {
    const { stage, time, scrollTop } = wheelStage();
    expect(stage.wheelBy(0, UP)).toBe(false);
    expect(stage.wheelBy(0, DOWN)).toBe(false); // the page is scrolling with it
    expect(scrollTop()).toBe(0);

    time.advance(PAUSE_MS);
    expect(stage.wheelBy(0, DOWN)).toBe(true);
  });

  it('goes by the longer axis of the wheel that begins its stream', () => {
    const sideways = wheelStage();
    expect(sideways.stage.wheelBy(-100, 0)).toBe(false); // the pages fit the width

    const mostlyDown = wheelStage();
    expect(mostlyDown.stage.wheelBy(-10, DOWN)).toBe(true);
    expect(mostlyDown.scrollTop()).toBe(100);
  });

  it('reads sideways ends in reading order, right to left too', () => {
    const ltr = wheelStage({ layout: 'horizontal' });
    expect(ltr.stage.wheelBy(100, 0)).toBe(false); // back, from the first page
    ltr.time.advance(PAUSE_MS);
    expect(ltr.stage.wheelBy(-100, 0)).toBe(true);

    const rtl = wheelStage({ layout: 'horizontal', direction: 'rtl' });
    expect(rtl.stage.wheelBy(-100, 0)).toBe(false); // the first page sits at the right
    rtl.time.advance(PAUSE_MS);
    expect(rtl.stage.wheelBy(100, 0)).toBe(true);
  });

  it('that moves nothing is kept, and decides nothing', () => {
    const { stage } = wheelStage();
    expect(stage.wheelBy(0, 0)).toBe(true);
    expect(stage.wheelBy(0, UP)).toBe(false);
    expect(stage.wheelBy(0, 0)).toBe(false); // the same stream
  });

  it('is left to the page when there are no pages to scroll', () => {
    const { stage } = wheelStage({}, 0);
    expect(stage.wheelBy(0, DOWN)).toBe(false);
  });

  it('has somewhere to go on an endless canvas, whichever way it pushes', () => {
    const { stage } = wheelStage({ bounded: false });
    const before = stage.getCamera();
    expect(stage.wheelBy(0, UP)).toBe(true);
    expect(stage.getCamera()).not.toEqual(before);
  });
});

describe('a wheel in paged flow', () => {
  // Fit-page shows a whole page, so the view sits at every edge.
  const FITS: StageConfig = { flow: 'paged', zoom: { mode: 'fit-page' } };

  it('turns the page while there is one to turn to', () => {
    const { stage, time } = wheelStage(FITS);
    expect(stage.wheelBy(0, UP)).toBe(false); // no page before the first

    time.advance(PAUSE_MS);
    expect(stage.wheelBy(0, DOWN)).toBe(true);
    expect(stage.getCurrentPageIndex()).toBe(1);
    expect(stage.wheelBy(0, DOWN)).toBe(true); // its momentum: kept, and it moves nothing
    expect(stage.getCurrentPageIndex()).toBe(1);
  });

  it('is left to the page past the last page', () => {
    const { stage } = wheelStage(FITS);
    stage.goToPage(2, { behavior: 'instant' });
    expect(stage.wheelBy(0, DOWN)).toBe(false);
    expect(stage.getCurrentPageIndex()).toBe(2);
  });

  it('is left to the page at the edge when wheels turn no pages', () => {
    const { stage } = wheelStage({ ...FITS, turnGestures: false });
    expect(stage.wheelBy(0, DOWN)).toBe(false);
    expect(stage.getCurrentPageIndex()).toBe(0);
  });
});

describe('scrollChaining', () => {
  it('false keeps every wheel over the view', () => {
    const { stage, scrollTop } = wheelStage({ scrollChaining: false });
    expect(stage.wheelBy(0, UP)).toBe(true);
    expect(scrollTop()).toBe(0);
    expect(stage.wheelBy(-100, 0)).toBe(true);
  });

  it('changes as a setting', () => {
    const { stage } = wheelStage();
    expect(stage.getSettings().scrollChaining).toBe(true);
    stage.updateSettings({ scrollChaining: false });
    expect(stage.wheelBy(0, UP)).toBe(true);
  });
});
