import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { computeReleaseVelocity, createStageGestureController } from './stage-gestures';
import type { StageGestureSink } from './stage-gestures';

describe('computeReleaseVelocity', () => {
  it('reads the mean velocity over the trailing window', () => {
    // 1 px/ms upward over the last 80ms
    const samples = Array.from({ length: 9 }, (_, i) => ({ t: i * 10, x: 0, y: -i * 10 }));
    const v = computeReleaseVelocity(samples, 80);
    expect(v).not.toBeNull();
    expect(v!.vx).toBeCloseTo(0, 6);
    expect(v!.vy).toBeCloseTo(-1000, 3); // px/s
  });

  it('ignores samples older than the window (drag, HOLD, then release = no fling)', () => {
    // fast motion long ago, then held still for 300ms
    const samples = [
      { t: 0, x: 0, y: 0 },
      { t: 20, x: 0, y: -200 },
      { t: 40, x: 0, y: -400 },
      { t: 340, x: 0, y: -400 },
    ];
    // only the final (stationary) sample is inside the 100ms window → null
    expect(computeReleaseVelocity(samples, 360)).toBeNull();
  });

  it('a stationary tail yields zero velocity, not a stale one', () => {
    const samples = [
      { t: 0, x: 0, y: -300 },
      { t: 40, x: 0, y: -400 },
      { t: 80, x: 0, y: -400 },
      { t: 120, x: 0, y: -400 },
    ];
    const v = computeReleaseVelocity(samples, 130);
    expect(v).not.toBeNull();
    expect(Math.abs(v!.vy)).toBeLessThan(1e-6);
  });

  it('too thin a trail is null (a plain tap must never fling)', () => {
    expect(computeReleaseVelocity([], 100)).toBeNull();
    expect(computeReleaseVelocity([{ t: 95, x: 0, y: 0 }], 100)).toBeNull();
    // two samples but nearly simultaneous — dt too small to trust
    expect(
      computeReleaseVelocity(
        [
          { t: 95, x: 0, y: 0 },
          { t: 99, x: 0, y: -40 },
        ],
        100,
      ),
    ).toBeNull();
  });
});

// ── controller lifecycle ──────────────────────────────────────────────────────
// Fake element/window/rAF/clock (the repo's fake-DOM pattern — no jsdom): every
// listener the controller attaches is captured and fired by hand, frames pump
// on demand, and the clock only moves when a test advances it. This is the
// harness that makes the 600-line state machine regression-testable.

interface HarnessOptions {
  sink?: boolean;
  claims?: (e: PointerEvent) => boolean;
  zoomGestures?: boolean;
  inMotion?: boolean;
}

function controllerHarness(opts: HarnessOptions = {}) {
  const elListeners = new Map<string, (e: unknown) => void>();
  const winListeners = new Map<string, (e: unknown) => void>();
  const el = {
    addEventListener: (t: string, fn: (e: unknown) => void) => elListeners.set(t, fn),
    removeEventListener: (t: string) => elListeners.delete(t),
    getBoundingClientRect: () => ({ left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600 }),
  } as unknown as HTMLElement;
  const win = {
    addEventListener: (t: string, fn: (e: unknown) => void) => winListeners.set(t, fn),
    removeEventListener: (t: string) => winListeners.delete(t),
  };
  vi.stubGlobal('window', win);
  let now = 0;
  vi.stubGlobal('performance', { now: () => now });
  const frames: FrameRequestCallback[] = [];
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    frames.push(cb);
    return frames.length;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {
    frames.length = 0; // the controller keeps at most one frame in flight
  });

  const host = {
    panBy: vi.fn(),
    zoomAround: vi.fn(),
    beginGesture: vi.fn(),
    endGesture: vi.fn(),
    fling: vi.fn(),
    doubleTapZoom: vi.fn(),
    cameraInMotion: vi.fn(() => opts.inMotion ?? false),
  };
  const sink =
    opts.sink === false
      ? null
      : ({
          down: vi.fn(),
          move: vi.fn(),
          up: vi.fn(),
          cancel: vi.fn(),
          hover: vi.fn(),
          longPress: vi.fn(),
          ...(opts.claims ? { claimsPoint: opts.claims } : {}),
        } as unknown as StageGestureSink);
  const detach = createStageGestureController(el, host, {
    wheelZoomFactor: () => 1.2,
    sink,
    zoomGestures: opts.zoomGestures,
  });
  const ev = (over: Record<string, unknown> = {}) =>
    ({
      pointerId: 7,
      pointerType: 'touch',
      clientX: 0,
      clientY: 0,
      button: 0,
      shiftKey: false,
      preventDefault: () => {},
      ...over,
    }) as unknown as PointerEvent;
  return {
    host,
    sink: sink as unknown as Record<string, ReturnType<typeof vi.fn>> | null,
    detach,
    down: (o?: Record<string, unknown>) => elListeners.get('pointerdown')!(ev(o)),
    move: (o?: Record<string, unknown>) => winListeners.get('pointermove')!(ev(o)),
    up: (o?: Record<string, unknown>) => winListeners.get('pointerup')!(ev(o)),
    pointerCancel: (o?: Record<string, unknown>) => winListeners.get('pointercancel')!(ev(o)),
    wheel: (o: Record<string, unknown> = {}) =>
      elListeners.get('wheel')!({
        deltaY: 100,
        deltaX: 0,
        deltaMode: 0,
        ctrlKey: false,
        metaKey: false,
        shiftKey: false,
        clientX: 10,
        clientY: 10,
        preventDefault: () => {},
        ...o,
      }),
    frame: () => {
      const f = frames.splice(0);
      f.forEach((cb) => cb(now));
    },
    advance: (ms: number) => {
      now += ms;
      vi.advanceTimersByTime(ms);
    },
  };
}

describe('gesture controller lifecycle', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('pan: slop absorbed, rAF-coalesced, and the RELEASE FLUSHES pending travel', () => {
    const h = controllerHarness({ sink: false });
    h.down({ clientX: 0, clientY: 0 });
    expect(h.host.beginGesture).toHaveBeenCalledTimes(1);
    expect(h.host.beginGesture).toHaveBeenCalledWith({ elastic: true }); // touch = rubber-band
    h.move({ clientX: 5, clientY: 5 }); // under slop: still a would-be tap
    expect(h.host.panBy).not.toHaveBeenCalled();
    h.move({ clientX: 30, clientY: 30 }); // slop crossed: pan, absorbed
    h.move({ clientX: 60, clientY: 60 });
    h.frame(); // one application per frame
    expect(h.host.panBy).toHaveBeenCalledTimes(1);
    expect(h.host.panBy).toHaveBeenLastCalledWith(30, 30);
    h.move({ clientX: 80, clientY: 80 });
    h.up({ clientX: 90, clientY: 90 }); // NO frame ran since the move…
    // …the release must apply the outstanding 30px itself, before ending
    expect(h.host.panBy).toHaveBeenCalledTimes(2);
    expect(h.host.panBy).toHaveBeenLastCalledWith(30, 30);
    expect(h.host.endGesture).toHaveBeenCalledTimes(1);
    expect(h.host.fling).not.toHaveBeenCalled(); // zero-dt trail: no fling
  });

  it('a fast pan release flings; a hold-then-release does not', () => {
    const h = controllerHarness({ sink: false });
    h.down({ clientX: 0, clientY: 0 });
    for (let i = 1; i <= 6; i++) {
      h.advance(16);
      h.move({ clientX: 0, clientY: -i * 30 });
    }
    h.up({ clientY: -190 });
    expect(h.host.fling).toHaveBeenCalledTimes(1);
    const [, vy] = h.host.fling.mock.calls[0]!;
    expect(vy).toBeLessThan(-500); // px/s, upward

    const h2 = controllerHarness({ sink: false });
    h2.down({ clientX: 0, clientY: 0 });
    for (let i = 1; i <= 6; i++) {
      h2.advance(16);
      h2.move({ clientX: 0, clientY: -i * 30 });
    }
    h2.advance(300); // hold still…
    h2.up({ clientY: -180 });
    expect(h2.host.fling).not.toHaveBeenCalled();
  });

  it('tap forwards a down/up pair; double-tap zooms instead of forwarding twice', () => {
    const h = controllerHarness();
    h.down({ clientX: 40, clientY: 40 });
    h.advance(50);
    h.up({ clientX: 42, clientY: 41 });
    expect(h.sink!.down).toHaveBeenCalledTimes(1);
    expect(h.sink!.up).toHaveBeenCalledTimes(1);
    expect(h.host.panBy).not.toHaveBeenCalled();
    h.advance(100);
    h.down({ clientX: 44, clientY: 43 });
    h.advance(40);
    h.up({ clientX: 44, clientY: 43 });
    expect(h.host.doubleTapZoom).toHaveBeenCalledTimes(1);
    expect(h.sink!.down).toHaveBeenCalledTimes(1); // second tap did NOT forward
  });

  it('long-press hands the contact to the hub and closes the camera bracket first', () => {
    const h = controllerHarness();
    h.down({ clientX: 40, clientY: 40 });
    h.advance(460); // long-press timer fires
    expect(h.host.endGesture).toHaveBeenCalledTimes(1); // handoff closed the bracket
    expect(h.sink!.longPress).toHaveBeenCalledTimes(1);
    h.move({ clientX: 60, clientY: 60 });
    expect(h.sink!.move).toHaveBeenCalledTimes(1);
    h.up({ clientX: 60, clientY: 60 });
    expect(h.sink!.up).toHaveBeenCalledTimes(1);
    expect(h.host.endGesture).toHaveBeenCalledTimes(1); // not double-ended
  });

  it('claims routing: tool-first contact, second finger cancels into a pinch', () => {
    const h = controllerHarness({ claims: () => true });
    h.down({ clientX: 100, clientY: 100 });
    expect(h.sink!.down).toHaveBeenCalledTimes(1); // owned from the first pixel
    expect(h.host.beginGesture).not.toHaveBeenCalled(); // not a camera gesture
    h.move({ clientX: 120, clientY: 120 });
    expect(h.sink!.move).toHaveBeenCalledTimes(1);
    h.down({ pointerId: 8, clientX: 300, clientY: 300 }); // second finger
    expect(h.sink!.cancel).toHaveBeenCalledTimes(1);
    expect(h.host.beginGesture).toHaveBeenCalledTimes(1); // the pinch's bracket
    h.move({ pointerId: 8, clientX: 400, clientY: 400 });
    h.frame();
    expect(h.host.zoomAround).toHaveBeenCalled(); // span grew → zoom applied
  });

  it('a pinch ends at its last COHERENT frame — no mixed-freshness flush', () => {
    const h = controllerHarness({ sink: false });
    h.down({ pointerId: 7, clientX: 100, clientY: 300 });
    h.down({ pointerId: 8, clientX: 300, clientY: 300 });
    h.move({ pointerId: 8, clientX: 400, clientY: 300 });
    h.frame();
    expect(h.host.zoomAround).toHaveBeenCalledTimes(1);
    h.move({ pointerId: 8, clientX: 500, clientY: 300 }); // no frame after this…
    h.up({ pointerId: 8, clientX: 500, clientY: 300 });
    // …and the lift adds NOTHING: the release position is fresh but the other
    // finger's is stale, and a centroid of two instants must never write the
    // camera. The sub-frame remainder is discarded, like the platform does.
    expect(h.host.zoomAround).toHaveBeenCalledTimes(1);
    expect(h.host.endGesture).not.toHaveBeenCalled(); // finger 7 still down: pan may continue
    h.up({ pointerId: 7, clientX: 100, clientY: 300 });
    expect(h.host.endGesture).toHaveBeenCalledTimes(1);
  });

  it('a touch-down while the camera is moving is a CATCH: no tap forwards', () => {
    const h = controllerHarness({ inMotion: true });
    h.down({ clientX: 40, clientY: 40 });
    expect(h.host.beginGesture).toHaveBeenCalledTimes(1); // the catch itself
    h.advance(50);
    h.up({ clientX: 40, clientY: 40 });
    expect(h.sink!.down).not.toHaveBeenCalled();
    expect(h.host.doubleTapZoom).not.toHaveBeenCalled();
    expect(h.host.endGesture).toHaveBeenCalledTimes(1);
  });

  it('wheel: ctrl zooms through the classifier, plain wheel pans', () => {
    const h = controllerHarness({ sink: false });
    h.wheel({ ctrlKey: true, clientX: 50, clientY: 60 });
    expect(h.host.zoomAround).toHaveBeenCalledWith({ x: 50, y: 60 }, 1.2);
    h.wheel({ deltaY: 40, deltaX: 4 });
    expect(h.host.panBy).toHaveBeenCalledWith(-4, -40);
  });

  it('detach mid-gesture balances the open camera bracket', () => {
    const h = controllerHarness({ sink: false });
    h.down({ clientX: 0, clientY: 0 });
    h.move({ clientX: 50, clientY: 50 });
    h.detach();
    expect(h.host.endGesture).toHaveBeenCalledTimes(1);
  });

  it('pointercancel discards without committing a fling', () => {
    const h = controllerHarness({ sink: false });
    h.down({ clientX: 0, clientY: 0 });
    for (let i = 1; i <= 5; i++) {
      h.advance(16);
      h.move({ clientX: 0, clientY: -i * 40 });
    }
    h.pointerCancel({});
    expect(h.host.fling).not.toHaveBeenCalled();
    expect(h.host.endGesture).toHaveBeenCalledTimes(1);
  });
});

describe('pinch release identity (a pinch stays a pinch)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('asymmetric release: the leftover finger neither pans nor flings', () => {
    const h = controllerHarness({ sink: false });
    h.down({ pointerId: 7, clientX: 150, clientY: 300 });
    h.down({ pointerId: 8, clientX: 250, clientY: 300 });
    // pinch OUT with real velocity on both fingers
    for (let i = 1; i <= 5; i++) {
      h.advance(16);
      h.move({ pointerId: 7, clientX: 150 - i * 15, clientY: 300 });
      h.move({ pointerId: 8, clientX: 250 + i * 15, clientY: 300 });
      h.frame();
    }
    const pansBefore = h.host.panBy.mock.calls.length;
    // finger 7 lifts; finger 8 rolls a few px while leaving, 30ms later
    h.up({ pointerId: 7, clientX: 75, clientY: 300 });
    h.advance(15);
    h.move({ pointerId: 8, clientX: 332, clientY: 302 }); // release-roll < slop
    h.frame();
    h.advance(15);
    h.up({ pointerId: 8, clientX: 334, clientY: 303 });
    // the roll produced NO pan at all (the transition flush no-ops on a
    // stationary centroid) and NO fling — a symmetric pinch ends still
    expect(h.host.panBy.mock.calls.length).toBe(pansBefore);
    expect(h.host.fling).not.toHaveBeenCalled();
    expect(h.host.endGesture).toHaveBeenCalledTimes(1);
  });

  it('the leftover finger re-earns panning by crossing slop', () => {
    const h = controllerHarness({ sink: false });
    h.down({ pointerId: 7, clientX: 150, clientY: 300 });
    h.down({ pointerId: 8, clientX: 250, clientY: 300 });
    h.move({ pointerId: 8, clientX: 280, clientY: 300 });
    h.frame();
    h.up({ pointerId: 7, clientX: 150, clientY: 300 });
    h.advance(180); // outlive the release-grace window: this is a CONTINUATION
    const pansBefore = h.host.panBy.mock.calls.length;
    h.move({ pointerId: 8, clientX: 285, clientY: 300 }); // 5px: still disarmed
    h.frame();
    expect(h.host.panBy.mock.calls.length).toBe(pansBefore);
    h.move({ pointerId: 8, clientX: 320, clientY: 300 }); // 40px: re-engaged
    h.move({ pointerId: 8, clientX: 340, clientY: 300 });
    h.frame();
    expect(h.host.panBy.mock.calls.length).toBeGreaterThan(pansBefore);
    h.up({ pointerId: 8, clientX: 340, clientY: 300 });
    expect(h.host.endGesture).toHaveBeenCalledTimes(1);
  });

  it('a FAST pinch release never scrolls: moving leftover finger inside the grace window', () => {
    const h = controllerHarness({ sink: false });
    h.down({ pointerId: 7, clientX: 250, clientY: 300 });
    h.down({ pointerId: 8, clientX: 350, clientY: 300 });
    for (let i = 1; i <= 4; i++) {
      h.advance(16);
      h.move({ pointerId: 7, clientX: 250 - i * 20, clientY: 300 });
      h.move({ pointerId: 8, clientX: 350 + i * 20, clientY: 300 });
      h.frame();
    }
    const pans = h.host.panBy.mock.calls.length;
    const zooms = h.host.zoomAround.mock.calls.length;
    // fast release: finger 7 lifts mid-motion; finger 8 keeps flying 25px
    // (well past slop) and lifts 40ms later — all inside the grace window
    h.up({ pointerId: 7, clientX: 170, clientY: 300 });
    h.advance(20);
    h.move({ pointerId: 8, clientX: 455, clientY: 302 });
    h.frame();
    h.advance(20);
    h.up({ pointerId: 8, clientX: 460, clientY: 303 });
    expect(h.host.panBy.mock.calls.length).toBe(pans); // not one pixel of scroll
    expect(h.host.zoomAround.mock.calls.length).toBe(zooms);
    expect(h.host.fling).not.toHaveBeenCalled(); // symmetric centroid: no glide
    expect(h.host.endGesture).toHaveBeenCalledTimes(1);
  });

  it('a translating pinch GLIDES from its centroid velocity on release', () => {
    const h = controllerHarness({ sink: false });
    h.down({ pointerId: 7, clientX: 150, clientY: 400 });
    h.down({ pointerId: 8, clientX: 250, clientY: 400 });
    // both fingers sweep upward together — the centroid has real velocity
    for (let i = 1; i <= 5; i++) {
      h.advance(16);
      h.move({ pointerId: 7, clientX: 150, clientY: 400 - i * 30 });
      h.move({ pointerId: 8, clientX: 250, clientY: 400 - i * 30 });
      h.frame();
    }
    h.up({ pointerId: 7, clientX: 150, clientY: 250 });
    h.advance(10);
    h.up({ pointerId: 8, clientX: 250, clientY: 250 });
    expect(h.host.fling).toHaveBeenCalledTimes(1);
    const [, vy] = h.host.fling.mock.calls[0]!;
    expect(vy).toBeLessThan(-500); // upward, from the CENTROID trail
  });
});

describe("replay of Bob's recorded iPhone fast pinch (gesture-log.html capture)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('the exact recorded release produces zero scroll and zero fling', () => {
    // Verbatim from the device log: two fingers pinching OUT fast, finger A
    // flicking away as it lifts (t=93), finger B flying another ~50px for
    // 51ms before its own up — the asymmetric release that moves the TRUE
    // centroid at ~800px/s while the span grows at ~5000px/s.
    const h = controllerHarness({ sink: false });
    const A = 7;
    const B = 8;
    type Ev = [number, 'down' | 'move' | 'up', number, number, number];
    const events: Ev[] = [
      [0, 'down', A, 146.7, 151],
      [24, 'down', B, 234.3, 220],
      [24, 'move', A, 146.7, 151],
      [27, 'move', A, 123, 137.3],
      [27, 'move', B, 254.7, 233.7],
      [27, 'move', B, 254.7, 233.7],
      [43, 'move', A, 97.3, 119.3],
      [43, 'move', B, 291, 248],
      [60, 'move', A, 56, 97.3],
      [60, 'move', B, 331.3, 268.7],
      [77, 'move', A, 7, 74],
      [77, 'move', B, 353.3, 300.7],
      [93, 'up', A, 5, 72],
      [94, 'move', B, 358.3, 316],
      [96, 'move', B, 360.3, 329.3],
      [111, 'move', B, 364, 347.3],
      [127, 'move', B, 374.7, 356.3],
      [144, 'move', B, 377.3, 358.3],
      [144, 'up', B, 379.3, 360.3],
    ];
    let clock = 0;
    let pansAtLift = -1;
    let zoomsAtLift = -1;
    for (const [t, kind, id, x, y] of events) {
      if (t > clock) {
        h.advance(t - clock);
        clock = t;
      }
      const payload = { pointerId: id, clientX: x, clientY: y };
      if (kind === 'down') h.down(payload);
      else if (kind === 'move') h.move(payload);
      else h.up(payload);
      h.frame(); // pump at least as often as the device did — conservative
      if (kind === 'up' && id === A) {
        pansAtLift = h.host.panBy.mock.calls.length;
        zoomsAtLift = h.host.zoomAround.mock.calls.length;
      }
    }
    // after finger A lifted: NOT ONE camera write from finger B's 50px of
    // release flight, and no fling — the span rate dwarfed the centroid rate
    expect(h.host.panBy.mock.calls.length).toBe(pansAtLift);
    expect(h.host.zoomAround.mock.calls.length).toBe(zoomsAtLift);
    expect(h.host.fling).not.toHaveBeenCalled();
    expect(h.host.endGesture).toHaveBeenCalledTimes(1);
  });
});
