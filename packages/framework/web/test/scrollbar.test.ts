import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createScrollbarPresses, scrollbarLayout } from '../src/scrollbar';
import type { ScrollbarMetrics, ScrollbarTrack } from '../src/scrollbar';

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

  it("leaves a press that reached the track from the thumb to the thumb's handler", () => {
    const presses = createScrollbarPresses(() => {});
    presses.pressTrack(press(350, {}), track(), 'jump');
    expect(stage.scrollTo).not.toHaveBeenCalled();
  });
});
