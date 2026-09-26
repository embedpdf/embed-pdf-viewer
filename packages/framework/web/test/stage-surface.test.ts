import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStageSurface } from '../src/stage-surface';
import type { StageSurfaceHost, StageSurfaceHub, StageSurfaceSample } from '../src/stage-surface';

const PAGE_7 = { kind: 'objectNumber', pageObjectNumber: 7 } as const;

// Fake element/window/observers (the repo's fake-DOM pattern — no jsdom): the
// binding's whole environment is hand-fired, so viewport reporting, DPR
// re-subscription, sample normalization, and teardown are all assertable.

function surfaceHarness(options: { hub?: boolean; source?: string } = {}) {
  const elListeners = new Map<string, (event: unknown) => void>();
  const winListeners = new Map<string, (event: unknown) => void>();
  const element = {
    clientWidth: 800,
    clientHeight: 600,
    addEventListener: (type: string, fn: (event: unknown) => void) => elListeners.set(type, fn),
    removeEventListener: (type: string) => elListeners.delete(type),
    getBoundingClientRect: () => ({
      left: 10,
      top: 20,
      right: 810,
      bottom: 620,
      width: 800,
      height: 600,
    }),
  } as unknown as HTMLElement;

  const observed: unknown[] = [];
  let roCallback: (() => void) | null = null;
  let roDisconnected = false;
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        roCallback = callback;
      }
      observe(target: unknown) {
        observed.push(target);
      }
      disconnect() {
        roDisconnected = true;
      }
    },
  );
  const mqListeners: Array<() => void> = [];
  const win = {
    devicePixelRatio: 2,
    matchMedia: () => ({
      addEventListener: (_: string, fn: () => void) => mqListeners.push(fn),
      removeEventListener: (_: string, fn: () => void) => {
        const i = mqListeners.indexOf(fn);
        if (i >= 0) mqListeners.splice(i, 1);
      },
    }),
    addEventListener: (type: string, fn: (event: unknown) => void) => winListeners.set(type, fn),
    removeEventListener: (type: string) => winListeners.delete(type),
  };
  vi.stubGlobal('window', win);
  vi.stubGlobal('performance', { now: () => 0 });
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', () => {});

  const host = {
    panBy: vi.fn(),
    zoomAround: vi.fn(),
    beginGesture: vi.fn(),
    endGesture: vi.fn(),
    fling: vi.fn(),
    isMoving: vi.fn(() => false),
    doubleTapZoom: vi.fn(),
    setViewportSize: vi.fn(),
    setDevicePixelRatio: vi.fn(),
    getPageAt: vi.fn((pt: { x: number; y: number }) => ({ ref: PAGE_7, point: pt, scale: 1.5 })),
    viewportToPage: vi.fn(() => ({ x: 1, y: 2 })),
  } satisfies StageSurfaceHost & Record<string, unknown>;

  const dispatched: StageSurfaceSample[] = [];
  const hub: StageSurfaceHub | null = options.hub
    ? {
        dispatchPointer: (sample: StageSurfaceSample) => dispatched.push(sample),
        getActiveTool: () => ({}),
        wouldClaimTouch: () => false,
      }
    : null;

  const detach = createStageSurface(element, host, { hub, source: options.source });
  return {
    el: element,
    elListeners,
    win,
    host,
    hub,
    dispatched,
    detach,
    mqListeners,
    roCallback: () => roCallback?.(),
    roDisconnectedRef: () => roDisconnected,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('createStageSurface', () => {
  it('reports the viewport immediately and again on every resize', () => {
    const harness = surfaceHarness();
    expect(harness.host.setViewportSize).toHaveBeenCalledWith({ width: 800, height: 600 });
    (harness.el as unknown as { clientWidth: number }).clientWidth = 500;
    harness.roCallback();
    expect(harness.host.setViewportSize).toHaveBeenLastCalledWith({ width: 500, height: 600 });
  });

  it('reports the device pixel ratio and re-subscribes when dppx moves', () => {
    const harness = surfaceHarness();
    expect(harness.host.setDevicePixelRatio).toHaveBeenCalledWith(2);
    (harness.win as { devicePixelRatio: number }).devicePixelRatio = 3;
    harness.mqListeners[0]!(); // the dppx media query fires
    expect(harness.host.setDevicePixelRatio).toHaveBeenLastCalledWith(3);
  });

  it('normalizes pointer events into page-resolved, source-stamped samples', () => {
    const harness = surfaceHarness({ hub: true, source: 'stage-main' });
    harness.elListeners.get('pointerdown')!({
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      buttons: 1,
      clientX: 110,
      clientY: 220,
      detail: 1,
      shiftKey: false,
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      preventDefault() {},
    });
    expect(harness.dispatched).toHaveLength(1);
    const sample = harness.dispatched[0];
    expect(sample.phase).toBe('down');
    expect(sample.viewport).toEqual({ x: 100, y: 200 }); // rect-relative
    expect(sample.page).toEqual({ ref: PAGE_7, point: { x: 100, y: 200 }, scale: 1.5 });
    expect(sample.source).toBe('stage-main'); // the lens identity rides every sample
    expect(sample.pointerType).toBe('mouse');
    expect(sample.project(PAGE_7)).toEqual({ x: 1, y: 2 }); // frame-stable projection
  });

  it('omits the source when none is configured (single-lens embeds)', () => {
    const harness = surfaceHarness({ hub: true });
    harness.elListeners.get('pointerdown')!({
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      buttons: 1,
      clientX: 50,
      clientY: 50,
      detail: 1,
      shiftKey: false,
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      preventDefault() {},
    });
    expect(harness.dispatched[0].source).toBeUndefined();
  });

  it('detach tears the whole binding down', () => {
    const harness = surfaceHarness({ hub: true, source: 'stage-main' });
    harness.detach();
    expect(harness.roDisconnectedRef()).toBe(true);
    expect(harness.mqListeners).toHaveLength(0);
    expect(harness.elListeners.has('pointerdown')).toBe(false); // controller detached
  });
});
