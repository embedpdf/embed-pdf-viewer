import { afterEach, describe, expect, it, vi } from 'vitest';

import { attachPagePointer, createClickCounter } from '../src/page-pointer';
import type { PagePointerPage, PagePointerSample } from '../src/page-pointer';
import { asElement, fakeElement } from './helpers/fake-element';

const PAGE = { kind: 'objectNumber', objectNumber: 3 } as const;

describe('createClickCounter', () => {
  it('counts presses close in time and place as one double or triple click', () => {
    const clicks = createClickCounter();
    expect(clicks(1000, 10, 10)).toBe(1);
    expect(clicks(1200, 12, 11)).toBe(2);
    expect(clicks(1500, 12, 11)).toBe(3);
  });

  it('starts again after a pause or a move', () => {
    const clicks = createClickCounter();
    clicks(1000, 10, 10);
    expect(clicks(1500, 10, 10)).toBe(1);
    expect(clicks(1600, 30, 10)).toBe(1);
  });
});

describe('attachPagePointer', () => {
  afterEach(() => vi.unstubAllGlobals());

  function harness(page: () => PagePointerPage) {
    const windowListeners = fakeElement();
    vi.stubGlobal('window', windowListeners);
    const element = fakeElement({
      getBoundingClientRect: () => ({ left: 100, top: 50 }),
    });
    const samples: PagePointerSample[] = [];
    const detach = attachPagePointer(
      asElement(element),
      { dispatchPointer: (sample) => samples.push(sample) },
      page,
    );
    return { element, windowListeners, samples, detach };
  }

  const pointer = (fields: Record<string, unknown> = {}) => ({
    button: 0,
    clientX: 140,
    clientY: 90,
    shiftKey: true,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    pointerType: 'pen',
    ...fields,
  });

  const pageAt = (zoom: number): PagePointerPage => ({
    ref: PAGE,
    transform: { viewScale: zoom * 2, rotation: 90, zoom },
    toPagePoint: (clientX, clientY) => ({ x: clientX / zoom, y: clientY / zoom }),
  });

  it('hands a press to the hub as a sample on its page, in page coordinates', () => {
    const { element, samples } = harness(() => pageAt(1));
    element.dispatch('pointerdown', pointer());
    expect(samples).toHaveLength(1);
    const [down] = samples;
    expect(down).toMatchObject({
      phase: 'down',
      viewport: { x: 40, y: 40 },
      page: { ref: PAGE, point: { x: 140, y: 90 }, scale: 2, rotation: 90, zoom: 1 },
      modifiers: { shift: true, alt: false, ctrl: false, meta: false },
      clickCount: 1,
      pointerType: 'pen',
    });
    // It projects onto its own page only.
    expect(down!.project(PAGE)).toEqual({ x: 140, y: 90 });
    expect(down!.project({ kind: 'objectNumber', objectNumber: 4 })).toBeNull();
  });

  it('reads the page when an event arrives, so a zoom mid-drag is followed', () => {
    let zoom = 1;
    const { element, windowListeners, samples } = harness(() => pageAt(zoom));
    element.dispatch('pointerdown', pointer());
    zoom = 2;
    windowListeners.dispatch('pointermove', pointer());
    expect(samples[1]).toMatchObject({ phase: 'move', page: { point: { x: 70, y: 45 }, zoom: 2 } });
  });

  it('follows a drag on the window until the press ends, and hovers from the element', () => {
    const { element, windowListeners, samples, detach } = harness(() => pageAt(1));
    windowListeners.dispatch('pointermove', pointer());
    expect(samples).toHaveLength(0);
    element.dispatch('pointermove', pointer());
    expect(samples.map((sample) => sample.phase)).toEqual(['move']);
    element.dispatch('pointerdown', pointer());
    element.dispatch('pointermove', pointer());
    windowListeners.dispatch('pointermove', pointer());
    windowListeners.dispatch('pointerup', pointer());
    windowListeners.dispatch('pointerup', pointer());
    expect(samples.map((sample) => sample.phase)).toEqual(['move', 'down', 'move', 'up']);

    detach();
    expect(element.listenerCount('pointerdown')).toBe(0);
    expect(windowListeners.listenerCount('pointermove')).toBe(0);
  });

  it('ignores every button but the main one, and counts a double click', () => {
    const { element, windowListeners, samples } = harness(() => pageAt(1));
    element.dispatch('pointerdown', pointer({ button: 2 }));
    expect(samples).toHaveLength(0);
    element.dispatch('pointerdown', pointer());
    windowListeners.dispatch('pointerup', pointer());
    element.dispatch('pointerdown', pointer());
    expect(
      samples.filter((sample) => sample.phase === 'down').map((sample) => sample.clickCount),
    ).toEqual([1, 2]);
  });
});
