import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { attachScrollbar, createScrollbarPresses, scrollbarLayout } from '../src/scrollbar';
import type { ScrollbarMetrics, ScrollbarTrack } from '../src/scrollbar';
import { asElement, fakeElement } from './helpers/fake-element';

/** A 1000 px view over 4000 px of content, scrolled `scrollTop` down. */
const metricsAt = (scrollTop: number): ScrollbarMetrics => ({
  scrollLeft: 0,
  scrollTop,
  scrollWidth: 800,
  scrollHeight: 4000,
  clientWidth: 800,
  clientHeight: 1000,
});

describe('scrollbarLayout', () => {
  it('sizes the thumb by the view over the content, and places it by the offset', () => {
    expect(scrollbarLayout(metricsAt(1500), true, 400, 24)).toEqual({
      client: 1000,
      offset: 1500,
      maxOffset: 3000,
      thumbLength: 100,
      travel: 300,
      thumbPosition: 150,
    });
  });

  it('keeps the thumb at least its minimum, over the travel that leaves', () => {
    const long = { ...metricsAt(0), scrollHeight: 100_000 };
    const layout = scrollbarLayout(long, true, 400, 24);
    expect(layout.thumbLength).toBe(24);
    expect(layout.travel).toBe(376);
  });

  it('measures the horizontal axis from the horizontal metrics', () => {
    const wide = { ...metricsAt(0), scrollLeft: 400, scrollWidth: 1600 };
    expect(scrollbarLayout(wide, false, 200, 24)).toMatchObject({
      client: 800,
      offset: 400,
      maxOffset: 800,
      thumbLength: 100,
      thumbPosition: 50,
    });
  });
});

describe('createScrollbarPresses', () => {
  let scrollTop = 0;
  const stage = {
    scrollTo: vi.fn((position: { top?: number }) => {
      scrollTop = position.top ?? scrollTop;
    }),
    scrollBy: vi.fn((delta: { top?: number }) => {
      scrollTop += delta.top ?? 0;
    }),
    panBy: vi.fn(),
  };
  const element = {
    getBoundingClientRect: () => ({ left: 0, top: 100 }),
    setPointerCapture: vi.fn(),
  } as unknown as Element;
  const track = (): ScrollbarTrack => ({
    stage,
    vertical: true,
    element,
    layout: scrollbarLayout(metricsAt(scrollTop), true, 400, 24),
    liveLayout: () => scrollbarLayout(metricsAt(scrollTop), true, 400, 24),
  });
  /** A press at `y` client pixels; on the track itself unless `target` says otherwise. */
  const press = (clientY: number, target: unknown = element) =>
    ({
      button: 0,
      clientX: 0,
      clientY,
      pointerId: 1,
      target,
      currentTarget: element,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    }) as unknown as PointerEvent;

  beforeEach(() => {
    scrollTop = 0;
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.stubGlobal('window', { setTimeout, setInterval });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('drags the thumb by relative pans, keeping the grabbed point under the pointer', () => {
    const dragging: boolean[] = [];
    const presses = createScrollbarPresses((value) => dragging.push(value));
    // The thumb is 100 px at the top of the 400 px track; grab it 20 px down.
    presses.pressThumb(press(120, {}), track());
    expect(dragging).toEqual([true]);
    presses.move(press(150), track());
    // 30 px of the 300 px travel is a tenth of the 3000 px range.
    expect(stage.panBy).toHaveBeenLastCalledWith(0, -300);
    presses.move(press(150), track());
    expect(stage.panBy).toHaveBeenCalledTimes(1);
    presses.release();
    presses.move(press(200), track());
    expect(stage.panBy).toHaveBeenCalledTimes(1);
    expect(dragging).toEqual([true, false]);
  });

  it('pages 90% of a view toward the pointer, repeats while held, and stops at the pointer', () => {
    const presses = createScrollbarPresses(() => {});
    presses.pressTrack(press(450), track(), 'page');
    expect(stage.scrollBy).toHaveBeenCalledTimes(1);
    expect(stage.scrollBy).toHaveBeenLastCalledWith({ top: 900 });
    vi.advanceTimersByTime(350 + 80 * 10);
    // The thumb (100 px over 300 px of travel) reaches the pointer at 350 px down the track.
    expect(scrollTop).toBe(2700);
    const calls = stage.scrollBy.mock.calls.length;
    vi.advanceTimersByTime(80 * 5);
    expect(stage.scrollBy).toHaveBeenCalledTimes(calls);
  });

  it('jumps the thumb under the pointer, then drags', () => {
    const dragging: boolean[] = [];
    const presses = createScrollbarPresses((value) => dragging.push(value));
    presses.pressTrack(press(350), track(), 'jump');
    // Centred under the pointer: (250 - 50) / 300 of the range.
    expect(stage.scrollTo).toHaveBeenLastCalledWith({ top: 2000 });
    expect(dragging).toEqual([true]);
  });

  it('keeps a press on the thumb or the track from the page below the bar', () => {
    const presses = createScrollbarPresses(() => {});
    const onThumb = press(110, {});
    presses.pressThumb(onThumb, track());
    expect(onThumb.stopPropagation).toHaveBeenCalled();
    presses.release();
    const onTrack = press(350);
    presses.pressTrack(onTrack, track(), 'page');
    expect(onTrack.stopPropagation).toHaveBeenCalled();
    presses.release();
  });

  it("leaves a press that reached the track from the thumb to the thumb's handler", () => {
    const presses = createScrollbarPresses(() => {});
    presses.pressTrack(press(350, {}), track(), 'jump');
    expect(stage.scrollTo).not.toHaveBeenCalled();
  });
});

describe('attachScrollbar', () => {
  let scrollTop = 0;
  let trackPress: 'page' | 'jump' = 'page';
  const stage = {
    scrollTo: vi.fn((position: { top?: number }) => {
      scrollTop = position.top ?? scrollTop;
    }),
    scrollBy: vi.fn((delta: { top?: number }) => {
      scrollTop += delta.top ?? 0;
    }),
    panBy: vi.fn(),
  };
  const thumb = { setPointerCapture: vi.fn() };

  /** A bound bar: a 400 px track that starts 100 px down the screen, the thumb inside it. */
  const bind = () => {
    const element = fakeElement({
      getBoundingClientRect: () => ({ left: 0, top: 100 }),
      setPointerCapture: vi.fn(),
    });
    const dragging: boolean[] = [];
    const detach = attachScrollbar(asElement(element), {
      bar: () => ({
        stage,
        vertical: true,
        layout: scrollbarLayout(metricsAt(scrollTop), true, 400, 24),
        liveLayout: () => scrollbarLayout(metricsAt(scrollTop), true, 400, 24),
        trackPress,
      }),
      onDragging: (value) => dragging.push(value),
    });
    /** A pointer event at `y` client pixels; on the track itself unless `target` says otherwise. */
    const send = (type: string, clientY: number, target: unknown = element) =>
      element.dispatch(type, {
        button: 0,
        clientX: 0,
        clientY,
        pointerId: 1,
        target,
        currentTarget: element,
        preventDefault: vi.fn(),
      });
    return { element, dragging, detach, send };
  };

  beforeEach(() => {
    scrollTop = 0;
    trackPress = 'page';
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.stubGlobal('window', { setTimeout, setInterval });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('keeps a press on the thumb from the page below the bar, and drags with the moves', () => {
    const bar = bind();
    // The thumb is 100 px at the top of the track; grab it 20 px down.
    expect(bar.send('pointerdown', 120, thumb).stopped).toBe(true);
    expect(thumb.setPointerCapture).toHaveBeenCalledWith(1);
    expect(bar.dragging).toEqual([true]);
    bar.send('pointermove', 150, thumb);
    // 30 px of the 300 px travel is a tenth of the 3000 px range.
    expect(stage.panBy).toHaveBeenLastCalledWith(0, -300);
    bar.send('pointerup', 150, thumb);
    bar.send('pointermove', 200, thumb);
    expect(stage.panBy).toHaveBeenCalledTimes(1);
    expect(bar.dragging).toEqual([true, false]);
  });

  it('keeps a press on the track from the page below the bar, and pages toward the pointer', () => {
    const bar = bind();
    expect(bar.send('pointerdown', 450).stopped).toBe(true);
    expect(stage.scrollBy).toHaveBeenLastCalledWith({ top: 900 });
    expect(bar.dragging).toEqual([]);
    bar.send('pointercancel', 450);
    const calls = stage.scrollBy.mock.calls.length;
    vi.advanceTimersByTime(350 + 80 * 5);
    expect(stage.scrollBy).toHaveBeenCalledTimes(calls);
  });

  it('reads the bar at each event', () => {
    const bar = bind();
    trackPress = 'jump';
    bar.send('pointerdown', 350);
    // Centred under the pointer: (250 - 50) / 300 of the range.
    expect(stage.scrollTo).toHaveBeenLastCalledWith({ top: 2000 });
    expect(bar.dragging).toEqual([true]);
  });

  it('keeps a press of any button from the page, and acts only on the main one', () => {
    const bar = bind();
    const press = bar.element.dispatch('pointerdown', {
      button: 2,
      clientX: 0,
      clientY: 450,
      pointerId: 1,
      target: bar.element,
      currentTarget: bar.element,
      preventDefault: vi.fn(),
    });
    expect(press.stopped).toBe(true);
    expect(stage.scrollBy).not.toHaveBeenCalled();
  });

  it('detached, it listens to nothing and ends the press under way', () => {
    const bar = bind();
    bar.send('pointerdown', 450);
    const calls = stage.scrollBy.mock.calls.length;
    bar.detach();
    for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) {
      expect(bar.element.listenerCount(type)).toBe(0);
    }
    // The held press no longer repeats.
    vi.advanceTimersByTime(350 + 80 * 5);
    expect(stage.scrollBy).toHaveBeenCalledTimes(calls);
    expect(bar.send('pointerdown', 450).stopped).toBe(false);
  });
});
