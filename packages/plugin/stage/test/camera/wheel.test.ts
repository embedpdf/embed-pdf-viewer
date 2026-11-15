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
  const placed = placedStage(pages, config, time.clock).stage;
  // Every wheel carries the time it happened: here, the clock's.
  const stage = {
    ...placed,
    wheelBy: (dx: number, dy: number) => placed.wheelBy(dx, dy, time.clock.now()),
  };
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

  it('stops at the end for a mouse wheel, however unevenly its notches come', () => {
    const { stage, time, atBottom } = wheelStage();
    stage.panBy(0, -1_000_000);
    stage.panBy(0, 150);
    // Notches are too far apart to tell a speed from, so none reads as a new push.
    for (const gapMs of [120, 45, 90, 45, 150, 60, 45]) {
      time.advance(gapMs);
      expect(stage.wheelBy(0, DOWN)).toBe(true);
    }
    expect(atBottom()).toBe(true);
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

// A trackpad sends a wheel every frame. The fingers speed a swipe up, and after
// they lift it coasts: wheels keep coming for a second or more, each smaller
// than the last. The next swipe often begins before they stop, so no pause
// sets the two apart.
const FRAME_MS = 16;
/** The fingers' part of a swipe, speeding up from rest: px a frame. */
const FINGERS = [2, 6, 14, 28, 46, 60];
/** What coasts in after it, slowing from `from` px a frame down to `to`. */
const coasting = (from: number, to = 1) => {
  const sizes: number[] = [];
  for (let size = from; size >= to; size *= 0.95) sizes.push(Math.round(size));
  return sizes;
};

type WheelStage = ReturnType<typeof wheelStage>;

/** Wheels a frame apart: the Stage's answer to each. */
const eachFrame = ({ stage, time }: WheelStage, deltas: number[]) =>
  deltas.map((dy) => {
    time.advance(FRAME_MS);
    return stage.wheelBy(0, dy);
  });
/** A swipe down the document, in wheels of these sizes. */
const down = (trackpad: WheelStage, sizes: number[]) =>
  eachFrame(
    trackpad,
    sizes.map((size) => -size),
  );
/** A swipe back up it. */
const up = eachFrame;

/** Wheels down the document, each `[size, ms after the last]`: the Stage's answer to each. */
const downAt = ({ stage, time }: WheelStage, wheels: [size: number, afterMs: number][]) =>
  wheels.map(([size, afterMs]) => {
    time.advance(afterMs);
    return stage.wheelBy(0, -size);
  });

/** Coasting as a browser may hand it over: of every three wheels, the last two as one. */
const twoAsOne = (coast: number[]): [size: number, afterMs: number][] => {
  const wheels: [number, number][] = [];
  for (let at = 0; at + 2 < coast.length; at += 3) {
    wheels.push([coast[at], FRAME_MS], [coast[at + 1] + coast[at + 2], 2 * FRAME_MS]);
  }
  return wheels;
};

/** A Stage with `room` px of the pages left to scroll down. */
function nearTheEnd(room: number): WheelStage {
  const trackpad = wheelStage();
  trackpad.stage.panBy(0, -1_000_000);
  trackpad.stage.panBy(0, room);
  return trackpad;
}

describe('a trackpad swipe over the Stage', () => {
  it('stops at the end it reaches, with all that coasts in after it', () => {
    const trackpad = nearTheEnd(300);
    expect(down(trackpad, [...FINGERS, ...coasting(58)])).not.toContain(false);
    expect(trackpad.atBottom()).toBe(true);
  });

  it('is left to the page when it follows one still coasting at the end', () => {
    const trackpad = nearTheEnd(300);
    down(trackpad, [...FINGERS, ...coasting(58, 12)]);
    expect(trackpad.atBottom()).toBe(true);

    // The fingers come back before the coasting stops. Their first wheel is
    // slower still; the one that speeds up is the new push.
    expect(down(trackpad, FINGERS)).toEqual([true, false, false, false, false, false]);
  });

  it('is left to the page when it follows one that just stopped coasting', () => {
    const trackpad = nearTheEnd(300);
    down(trackpad, [...FINGERS, ...coasting(58)]);
    expect(down(trackpad, FINGERS)).toEqual([true, false, false, false, false, false]);
  });

  it('keeps its coasting when the browser hands over two wheels as one', () => {
    const trackpad = nearTheEnd(300);
    down(trackpad, FINGERS);
    expect(downAt(trackpad, twoAsOne(coasting(58)))).not.toContain(false);
  });

  it('keeps a steady scroll that reaches the end in uneven wheels', () => {
    // As Chromium delivered a drag at 2.4 px a ms: one wheel for every one,
    // two or three the device sent, so the sizes jump while the speed holds.
    const trackpad = nearTheEnd(120);
    const steady: [number, number][] = [
      [32, 14],
      [13, 6],
      [44, 18],
      [59, 25],
      [56, 23],
      [28, 12],
      [31, 13],
      [55, 23],
      [68, 29],
      [14, 6],
    ];
    expect(downAt(trackpad, steady)).not.toContain(false);
    expect(trackpad.atBottom()).toBe(true);
  });

  it('keeps a steady scroll on a fast screen, whose wheels come closer than a frame', () => {
    // Two wheels a frame, uneven in size and in time: wheel by wheel the speed
    // triples and falls back, over a frame it holds.
    const trackpad = nearTheEnd(60);
    const steady: [number, number][] = [];
    for (let frame = 0; frame < 12; frame++) steady.push([26, 8], [12, 11]);
    expect(downAt(trackpad, steady)).not.toContain(false);
    expect(trackpad.atBottom()).toBe(true);
  });

  it('keeps the last of its coasting, a pixel or two a frame', () => {
    const trackpad = nearTheEnd(300);
    down(trackpad, [...FINGERS, ...coasting(58, 3)]);
    // A pixel every other frame, then two in one: four times the speed, and
    // still what coasts in.
    const last: [number, number][] = [
      [2, 16],
      [1, 17],
      [1, 33],
      [2, 16],
      [1, 16],
      [1, 34],
      [1, 16],
    ];
    expect(downAt(trackpad, last)).not.toContain(false);
  });

  it('keeps its coasting when a busy page delivers it late, as one wheel', () => {
    const trackpad = nearTheEnd(300);
    down(trackpad, [...FINGERS, ...coasting(58, 30)]);
    // What coasts in meanwhile comes as one wheel, and the coasting goes on after it.
    const missed = coasting(29, 22);
    const late = missed.reduce((sum, size) => sum + size, 0);
    expect(downAt(trackpad, [[late, missed.length * FRAME_MS]])).toEqual([true]);
    expect(down(trackpad, coasting(21))).not.toContain(false);
  });

  it('keeps its coasting when it reaches the end still speeding up', () => {
    const trackpad = nearTheEnd(10);
    expect(down(trackpad, [...FINGERS, ...coasting(58)])).not.toContain(false);
    expect(trackpad.atBottom()).toBe(true);
  });

  it('back up from the end scrolls the pages at once', () => {
    const trackpad = nearTheEnd(300);
    down(trackpad, [...FINGERS, ...coasting(58, 12)]);
    const atEnd = trackpad.scrollTop();

    expect(up(trackpad, [2, 6])).toEqual([true, true]);
    expect(trackpad.scrollTop()).toBe(atEnd - 8);
  });

  it('back up scrolls the pages again when it follows one the page took', () => {
    const trackpad = nearTheEnd(0);
    expect(down(trackpad, [...FINGERS, ...coasting(58, 12)])).not.toContain(true);
    const atEnd = trackpad.scrollTop();

    // The page still gets the first wheel, slower than what coasts. The push
    // after it has somewhere to go in the pages.
    expect(up(trackpad, FINGERS)).toEqual([false, true, true, true, true, true]);
    expect(trackpad.scrollTop()).toBe(atEnd - (6 + 14 + 28 + 46 + 60));
  });

  it("stays the page's while its swipes keep pushing past the end", () => {
    const trackpad = nearTheEnd(0);
    const swipe = [...FINGERS, ...coasting(58, 12)];
    expect(down(trackpad, [...swipe, ...swipe, ...swipe])).not.toContain(true);
  });

  it('stays in the pages while they have somewhere to go, however it wobbles', () => {
    const trackpad = wheelStage();
    // It slows, then speeds up sideways, where the pages have no room.
    expect(down(trackpad, [20, 12, 4])).not.toContain(false);
    expect(trackpad.stage.wheelBy(-12, -3)).toBe(true);
    expect(trackpad.scrollTop()).toBe(39);
  });
});

describe('a wheel in paged flow', () => {
  // Fit-page shows a whole page, so the view sits at every edge. The automatic
  // zoom (100%) fits the width and scrolls down a tall page.
  const FITS: StageConfig = { flow: 'paged', zoom: { mode: 'fit-page' } };
  const TALL: StageConfig = { flow: 'paged' };
  /** One trackpad swipe: the fingers, and what coasts in until the next one begins. */
  const SWIPE = [...FINGERS, ...coasting(58, 12)];

  it('turns the page while there is one to turn to', () => {
    const { stage, time } = wheelStage(FITS);
    expect(stage.wheelBy(0, UP)).toBe(false); // no page before the first

    time.advance(PAUSE_MS);
    expect(stage.wheelBy(0, DOWN)).toBe(true);
    expect(stage.getCurrentPageIndex()).toBe(1);
    expect(stage.wheelBy(0, DOWN)).toBe(true); // its momentum: kept, and it moves nothing
    expect(stage.getCurrentPageIndex()).toBe(1);
  });

  it("turns to the last page and keeps what coasts in; the next swipe is the page's", () => {
    const trackpad = wheelStage(FITS);
    trackpad.stage.goToPage(1, { behavior: 'instant' });
    expect(down(trackpad, [...FINGERS, ...coasting(58, 12)])).not.toContain(false);
    expect(trackpad.stage.getCurrentPageIndex()).toBe(2);

    expect(down(trackpad, FINGERS)).toEqual([true, false, false, false, false, false]);
  });

  it('turns one page for a trackpad swipe, however long it coasts', () => {
    const trackpad = wheelStage(FITS);
    expect(down(trackpad, [...FINGERS, ...coasting(58)])).not.toContain(false);
    expect(trackpad.stage.getCurrentPageIndex()).toBe(1);
  });

  it('turns one page when the browser hands the coasting over two wheels as one', () => {
    const trackpad = wheelStage(FITS);
    down(trackpad, FINGERS);
    downAt(trackpad, twoAsOne(coasting(58)));
    expect(trackpad.stage.getCurrentPageIndex()).toBe(1);
  });

  it('turns the next page for a swipe that follows one still coasting', () => {
    const trackpad = wheelStage(FITS);
    down(trackpad, SWIPE);
    expect(trackpad.stage.getCurrentPageIndex()).toBe(1);

    // No pause: the fingers come back while the last swipe still coasts.
    down(trackpad, SWIPE);
    expect(trackpad.stage.getCurrentPageIndex()).toBe(2);
  });

  it('turns back for a swipe up that follows one still coasting down', () => {
    const trackpad = wheelStage(FITS);
    down(trackpad, SWIPE);
    expect(trackpad.stage.getCurrentPageIndex()).toBe(1);

    up(trackpad, SWIPE);
    expect(trackpad.stage.getCurrentPageIndex()).toBe(0);
  });

  it('reads down a tall page to its bottom; the next swipe turns it, and the one after reads on', () => {
    const trackpad = wheelStage(TALL);
    down(trackpad, SWIPE);
    expect(trackpad.stage.getCurrentPageIndex()).toBe(0);
    expect(trackpad.atBottom()).toBe(true);

    // The swipe that turns the page lands at the top of the next, and what
    // coasts in after it moves nothing.
    down(trackpad, SWIPE);
    expect(trackpad.stage.getCurrentPageIndex()).toBe(1);
    expect(trackpad.scrollTop()).toBe(0);

    down(trackpad, FINGERS);
    expect(trackpad.stage.getCurrentPageIndex()).toBe(1);
    expect(trackpad.scrollTop()).toBeGreaterThan(0);
  });

  it('turns page after page for a trackpad with scrollChaining off', () => {
    const trackpad = wheelStage({ ...FITS, scrollChaining: false });
    down(trackpad, SWIPE);
    down(trackpad, SWIPE);
    expect(trackpad.stage.getCurrentPageIndex()).toBe(2);
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
