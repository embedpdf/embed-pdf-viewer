import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStageSurface } from './stage-surface';
import type { StageSurfaceHost, StageSurfaceHub, StageSurfaceSample } from './stage-surface';

// Fake element/window/observers (the repo's fake-DOM pattern — no jsdom): the
// binding's whole environment is hand-fired, so viewport reporting, DPR
// re-subscription, sample normalization, and teardown are all assertable.

function surfaceHarness(opts: { hub?: boolean; source?: string } = {}) {
  const elListeners = new Map<string, (e: unknown) => void>();
  const winListeners = new Map<string, (e: unknown) => void>();
  const el = {
    clientWidth: 800,
    clientHeight: 600,
    addEventListener: (t: string, fn: (e: unknown) => void) => elListeners.set(t, fn),
    removeEventListener: (t: string) => elListeners.delete(t),
    getBoundingClientRect: () => ({ left: 10, top: 20, right: 810, bottom: 620, width: 800, height: 600 }),
  } as unknown as HTMLElement;

  const observed: unknown[] = [];
  let roCallback: (() => void) | null = null;
  let roDisconnected = false;
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(cb: () => void) {
        roCallback = cb;
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
    addEventListener: (t: string, fn: (e: unknown) => void) => winListeners.set(t, fn),
    removeEventListener: (t: string) => winListeners.delete(t),
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
    cameraInMotion: vi.fn(() => false),
    doubleTapZoom: vi.fn(),
    setViewport: vi.fn(),
    setDevicePixelRatio: vi.fn(),
    pageAt: vi.fn((pt: { x: number; y: number }) => ({ pon: 7, point: pt, scale: 1.5 })),
    pointOnPage: vi.fn(() => ({ x: 1, y: 2 })),
  } satisfies StageSurfaceHost & Record<string, unknown>;

  const dispatched: StageSurfaceSample[] = [];
  const hub: StageSurfaceHub | null = opts.hub
    ? {
        dispatch: (s) => dispatched.push(s),
        activeTool: () => ({}),
        wouldClaimTouch: () => false,
      }
    : null;

  const detach = createStageSurface(el, host, { hub, source: opts.source });
  return { el, elListeners, win, host, hub, dispatched, detach, roCallback, mqListeners,
    roDisconnectedRef: () => roDisconnected };
}

afterEach(() => vi.unstubAllGlobals());

describe('createStageSurface', () => {
  it('reports the viewport immediately and again on every resize', () => {
    const h = surfaceHarness();
    expect(h.host.setViewport).toHaveBeenCalledWith({ width: 800, height: 600 });
    (h.el as unknown as { clientWidth: number }).clientWidth = 500;
    h.roCallback!();
    expect(h.host.setViewport).toHaveBeenLastCalledWith({ width: 500, height: 600 });
  });

  it('reports the device pixel ratio and re-subscribes when dppx moves', () => {
    const h = surfaceHarness();
    expect(h.host.setDevicePixelRatio).toHaveBeenCalledWith(2);
    (h.win as { devicePixelRatio: number }).devicePixelRatio = 3;
    h.mqListeners[0]!(); // the dppx media query fires
    expect(h.host.setDevicePixelRatio).toHaveBeenLastCalledWith(3);
  });

  it('normalizes pointer events into page-resolved, source-stamped samples', () => {
    const h = surfaceHarness({ hub: true, source: 'stage-main' });
    h.elListeners.get('pointerdown')!({
      pointerId: 1, pointerType: 'mouse', button: 0, buttons: 1,
      clientX: 110, clientY: 220, detail: 1,
      shiftKey: false, altKey: false, ctrlKey: false, metaKey: false,
      preventDefault() {},
    });
    expect(h.dispatched).toHaveLength(1);
    const s = h.dispatched[0];
    expect(s.phase).toBe('down');
    expect(s.viewport).toEqual({ x: 100, y: 200 }); // rect-relative
    expect(s.page).toEqual({ pon: 7, point: { x: 100, y: 200 }, scale: 1.5 });
    expect(s.source).toBe('stage-main'); // the lens identity rides every sample
    expect(s.pointerType).toBe('mouse');
    expect(s.project(7)).toEqual({ x: 1, y: 2 }); // frame-stable projection
  });

  it('omits the source when none is configured (single-lens embeds)', () => {
    const h = surfaceHarness({ hub: true });
    h.elListeners.get('pointerdown')!({
      pointerId: 1, pointerType: 'mouse', button: 0, buttons: 1,
      clientX: 50, clientY: 50, detail: 1,
      shiftKey: false, altKey: false, ctrlKey: false, metaKey: false,
      preventDefault() {},
    });
    expect(h.dispatched[0].source).toBeUndefined();
  });

  it('detach tears the whole binding down', () => {
    const h = surfaceHarness({ hub: true, source: 'stage-main' });
    h.detach();
    expect(h.roDisconnectedRef()).toBe(true);
    expect(h.mqListeners).toHaveLength(0);
    expect(h.elListeners.has('pointerdown')).toBe(false); // controller detached
  });
});
