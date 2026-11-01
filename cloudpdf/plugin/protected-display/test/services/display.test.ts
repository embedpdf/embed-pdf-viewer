import { manualClock } from '@embedpdf/core/testing';
import type { PicturePage } from '@embedpdf/plugin-render/contract';
import type { Rect } from '@embedpdf/plugin-stage/contract/host';
import { describe, expect, it } from 'vitest';

import { createDisplay, type LentPage } from '../../src/services/display';
import { pageFrameOf } from '../../src/services/frames';
import { fakeFrames, fakeScreen, pictureOf, pluginClockOf, settle } from '../helpers/fakes';

/** A display over a fake screen, with the part of each page on screen set by the test. */
function displayed() {
  const manual = manualClock();
  const screen = fakeScreen();
  const frames = fakeFrames();
  const problems: string[] = [];
  let visible: Rect | null = { x: 100, y: 200, width: 150, height: 100 };
  const display = createDisplay({
    screen,
    fetchFrame: frames.fetchFrame,
    clock: pluginClockOf(manual),
    visibleRectOf: () => visible,
    onProblem: (message) => problems.push(message),
    signal: new AbortController().signal,
  });
  const lend = (page: PicturePage): LentPage => ({ host: { box: page.pageIndex }, page });
  return {
    display,
    screen,
    frames,
    problems,
    manual,
    lend,
    setVisible: (rect: Rect | null) => {
      visible = rect;
    },
  };
}

describe('the display', () => {
  it('moves into the box of the page on screen, and shows its page frame once it’s there', async () => {
    const { display, screen, frames, lend } = displayed();
    const lent = lend(pictureOf(1));
    frames.holding = true;
    display.show(lent);
    expect(screen.host).toBe(lent.host);
    expect(screen.page.visible).toBe(false);

    frames.requests[0].arrive();
    await settle();
    const frame = pageFrameOf(lent.page, 0);
    expect(frames.requests[0].query).toEqual(frame.query);
    expect(screen.page.onScreen).toBe(frame.key);
    expect(screen.page.visible).toBe(true);
  });

  it('hides the page until the new page’s frame is on screen, and never shows a page passed by', async () => {
    const { display, screen, frames, lend } = displayed();
    display.show(lend(pictureOf(1)));
    await settle();
    expect(screen.page.visible).toBe(true);

    frames.holding = true;
    display.show(lend(pictureOf(2)));
    expect(screen.page.visible).toBe(false);
    const third = lend(pictureOf(3));
    display.show(third);
    // Page 2's frame arrives after page 3 was asked for: it doesn't show.
    frames.requests[1].arrive();
    await settle();
    expect(screen.page.visible).toBe(false);

    frames.requests[2].arrive();
    await settle();
    expect(screen.page.onScreen).toBe(pageFrameOf(third.page, 0).key);
    expect(screen.page.visible).toBe(true);
  });

  it('keeps showing a page frame it has when the page’s box comes back', async () => {
    const { display, screen, frames, lend } = displayed();
    display.show(lend(pictureOf(1)));
    await settle();
    const before = screen.page.calls.length;
    const again = lend(pictureOf(1, { zoom: 2 }));
    display.show(again);
    await settle();
    expect(screen.host).toBe(again.host);
    expect(frames.requests).toHaveLength(1);
    expect(screen.page.calls.slice(before).some((call) => call.type === 'hide')).toBe(false);
    expect(screen.page.visible).toBe(true);
  });

  it('shows a sharp frame of the part on screen once the view rests, past where the page frame is sharp', async () => {
    const { display, screen, frames, manual, lend } = displayed();
    const lent = lend(pictureOf(1));
    display.show(lent);
    await settle();
    // At its first size the page frame is sharp: no sharp frame.
    manual.advance(250);
    await settle();
    expect(frames.requests).toHaveLength(1);

    lent.page = pictureOf(1, { zoom: 4 });
    display.moving();
    manual.advance(249);
    await settle();
    expect(frames.requests).toHaveLength(1);
    manual.advance(1);
    await settle();
    expect(frames.requests[1].query).toMatchObject({
      'target.kind': 'rect',
      'viewport.width': '1600',
    });
    const placed = screen.sharp.calls.find((call) => call.type === 'place');
    expect(placed).toMatchObject({ rect: { width: expect.closeTo(800, 1) } });
    expect(screen.sharp.visible).toBe(true);
  });

  it('hides the sharp frame at once when the view moves, and asks for no frame it has', async () => {
    const { display, screen, frames, manual, lend } = displayed();
    const lent = lend(pictureOf(1));
    display.show(lent);
    await settle();
    lent.page = pictureOf(1, { zoom: 4 });
    display.moving();
    manual.advance(250);
    await settle();
    expect(screen.sharp.visible).toBe(true);

    display.moving();
    expect(screen.sharp.visible).toBe(false);
    manual.advance(250);
    await settle();
    expect(screen.sharp.visible).toBe(true);
    expect(frames.requests).toHaveLength(2);
  });

  it('drops a sharp frame that arrives after the view moved again', async () => {
    const { display, screen, frames, manual, lend } = displayed();
    const lent = lend(pictureOf(1));
    display.show(lent);
    await settle();
    lent.page = pictureOf(1, { zoom: 4 });
    frames.holding = true;
    display.moving();
    manual.advance(250);
    display.moving();
    frames.requests[1].arrive();
    await settle();
    expect(screen.sharp.calls.some((call) => call.type === 'show')).toBe(false);
    expect(screen.sharp.visible).toBe(false);
  });

  it('draws the page frame again when the view rests at another size, and only then', async () => {
    const { display, screen, manual, lend, setVisible } = displayed();
    setVisible(null);
    const lent = lend(pictureOf(1));
    display.show(lent);
    await settle();
    display.moving();
    manual.advance(250);
    expect(screen.page.calls.filter((call) => call.type === 'redraw')).toHaveLength(0);

    lent.page = pictureOf(1, { zoom: 3 });
    display.moving();
    manual.advance(250);
    display.moving();
    manual.advance(250);
    expect(screen.page.calls.filter((call) => call.type === 'redraw')).toHaveLength(1);
  });

  it('keeps an edited page showing until its new frame is on screen', async () => {
    const { display, screen, frames, lend } = displayed();
    const lent = lend(pictureOf(1));
    display.show(lent);
    await settle();
    const before = screen.page.onScreen;

    frames.holding = true;
    display.invalidate([lent.page.ref]);
    expect(screen.page.loaded.has(before!)).toBe(false);
    expect(screen.page.visible).toBe(true);
    await settle();
    expect(screen.page.onScreen).toBe(before);

    frames.requests[1].arrive();
    await settle();
    expect(screen.page.onScreen).toBe(pageFrameOf(lent.page, 1).key);
    expect(screen.page.calls.filter((call) => call.type === 'hide')).toHaveLength(1);
  });

  it('leaves a page’s box when it goes, and closes the screen with itself', async () => {
    const { display, screen, manual, lend } = displayed();
    const lent = lend(pictureOf(1));
    display.show(lent);
    await settle();
    display.forget(lend(pictureOf(2)));
    expect(screen.host).toBe(lent.host);
    display.forget(lent);
    expect(screen.host).toBeNull();

    display.moving();
    display.close();
    expect(screen.closed).toBe(true);
    expect(manual.pending.timers).toBe(0);
  });

  it('says when a frame is refused', async () => {
    const { display, problems, lend, screen } = displayed();
    const lent = lend(pictureOf(1));
    screen.page.load = () => Promise.reject(new Error('a frame was refused (403): no'));
    display.show(lent);
    await settle();
    expect(problems).toEqual(['a frame was refused (403): no']);
  });
});
