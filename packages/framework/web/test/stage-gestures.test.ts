import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { computeReleaseVelocity, createStageGestureController } from '../src/stage-gestures';
import type { StageGestureSink } from '../src/stage-gestures';

describe('computeReleaseVelocity', () => {
  it('reads the mean velocity over the trailing window', () => {
    // 1 px/ms upward over the last 80ms
    const samples = Array.from({ length: 9 }, (_, i) => ({ t: i * 10, x: 0, y: -i * 10 }));
    const velocity = computeReleaseVelocity(samples, 80);
    expect(velocity).not.toBeNull();
    expect(velocity!.vx).toBeCloseTo(0, 6);
    expect(velocity!.vy).toBeCloseTo(-1000, 3); // px/s
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
    const velocity = computeReleaseVelocity(samples, 130);
    expect(velocity).not.toBeNull();
    expect(Math.abs(velocity!.vy)).toBeLessThan(1e-6);
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
  claims?: (event: PointerEvent) => boolean;
  zoomGestures?: boolean;
  inMotion?: boolean;
}

function controllerHarness(options: HarnessOptions = {}) {
  const elListeners = new Map<string, (event: unknown) => void>();
  const winListeners = new Map<string, (event: unknown) => void>();
  const element = {
    addEventListener: (type: string, fn: (event: unknown) => void) => elListeners.set(type, fn),
    removeEventListener: (type: string) => elListeners.delete(type),
    getBoundingClientRect: () => ({
      left: 0,
      top: 0,
      right: 800,
      bottom: 600,
      width: 800,
      height: 600,
    }),
  } as unknown as HTMLElement;
  const win = {
    addEventListener: (type: string, fn: (event: unknown) => void) => winListeners.set(type, fn),
    removeEventListener: (type: string) => winListeners.delete(type),
  };
  vi.stubGlobal('window', win);
  let now = 0;
  vi.stubGlobal('performance', { now: () => now });
  const frames: FrameRequestCallback[] = [];
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.push(callback);
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
    isMoving: vi.fn(() => options.inMotion ?? false),
  };
  const sink =
    options.sink === false
      ? null
      : ({
          down: vi.fn(),
          move: vi.fn(),
          up: vi.fn(),
          cancel: vi.fn(),
          hover: vi.fn(),
          longPress: vi.fn(),
          ...(options.claims ? { claimsPoint: options.claims } : {}),
        } as unknown as StageGestureSink);
  const detach = createStageGestureController(element, host, {
    wheelZoomFactor: () => 1.2,
    sink,
    zoomGestures: options.zoomGestures,
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
    down: (overrides?: Record<string, unknown>) => elListeners.get('pointerdown')!(ev(overrides)),
    move: (overrides?: Record<string, unknown>) => winListeners.get('pointermove')!(ev(overrides)),
    up: (overrides?: Record<string, unknown>) => winListeners.get('pointerup')!(ev(overrides)),
    pointerCancel: (overrides?: Record<string, unknown>) =>
      winListeners.get('pointercancel')!(ev(overrides)),
    wheel: (overrides: Record<string, unknown> = {}) =>
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
        ...overrides,
      }),
    frame: () => {
      const pending = frames.splice(0);
      pending.forEach((callback) => callback(now));
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
    const harness = controllerHarness({ sink: false });
    harness.down({ clientX: 0, clientY: 0 });
    expect(harness.host.beginGesture).toHaveBeenCalledTimes(1);
    expect(harness.host.beginGesture).toHaveBeenCalledWith({ elastic: true }); // touch = rubber-band
    harness.move({ clientX: 5, clientY: 5 }); // under slop: still a would-be tap
    expect(harness.host.panBy).not.toHaveBeenCalled();
    harness.move({ clientX: 30, clientY: 30 }); // slop crossed: pan, absorbed
    harness.move({ clientX: 60, clientY: 60 });
    harness.frame(); // one application per frame
    expect(harness.host.panBy).toHaveBeenCalledTimes(1);
    expect(harness.host.panBy).toHaveBeenLastCalledWith(30, 30);
    harness.move({ clientX: 80, clientY: 80 });
    harness.up({ clientX: 90, clientY: 90 }); // no frame ran since the move…
    // …the release must apply the outstanding 30px itself, before ending
    expect(harness.host.panBy).toHaveBeenCalledTimes(2);
    expect(harness.host.panBy).toHaveBeenLastCalledWith(30, 30);
    expect(harness.host.endGesture).toHaveBeenCalledTimes(1);
    expect(harness.host.fling).not.toHaveBeenCalled(); // zero-dt trail: no fling
  });

  it('a fast pan release flings; a hold-then-release does not', () => {
    const harness = controllerHarness({ sink: false });
    harness.down({ clientX: 0, clientY: 0 });
    for (let i = 1; i <= 6; i++) {
      harness.advance(16);
      harness.move({ clientX: 0, clientY: -i * 30 });
    }
    harness.up({ clientY: -190 });
    expect(harness.host.fling).toHaveBeenCalledTimes(1);
    const [, vy] = harness.host.fling.mock.calls[0]!;
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
    const harness = controllerHarness();
    harness.down({ clientX: 40, clientY: 40 });
    harness.advance(50);
    harness.up({ clientX: 42, clientY: 41 });
    expect(harness.sink!.down).toHaveBeenCalledTimes(1);
    expect(harness.sink!.up).toHaveBeenCalledTimes(1);
    expect(harness.host.panBy).not.toHaveBeenCalled();
    harness.advance(100);
    harness.down({ clientX: 44, clientY: 43 });
    harness.advance(40);
    harness.up({ clientX: 44, clientY: 43 });
    expect(harness.host.doubleTapZoom).toHaveBeenCalledTimes(1);
    expect(harness.sink!.down).toHaveBeenCalledTimes(1); // second tap did not forward
  });

  it('long-press hands the contact to the hub and closes the camera bracket first', () => {
    const harness = controllerHarness();
    harness.down({ clientX: 40, clientY: 40 });
    harness.advance(460); // long-press timer fires
    expect(harness.host.endGesture).toHaveBeenCalledTimes(1); // handoff closed the bracket
    expect(harness.sink!.longPress).toHaveBeenCalledTimes(1);
    harness.move({ clientX: 60, clientY: 60 });
    expect(harness.sink!.move).toHaveBeenCalledTimes(1);
    harness.up({ clientX: 60, clientY: 60 });
    expect(harness.sink!.up).toHaveBeenCalledTimes(1);
    expect(harness.host.endGesture).toHaveBeenCalledTimes(1); // not double-ended
  });

  it('claims routing: tool-first contact, second finger cancels into a pinch', () => {
    const harness = controllerHarness({ claims: () => true });
    harness.down({ clientX: 100, clientY: 100 });
    expect(harness.sink!.down).toHaveBeenCalledTimes(1); // owned from the first pixel
    expect(harness.host.beginGesture).not.toHaveBeenCalled(); // not a camera gesture
    harness.move({ clientX: 120, clientY: 120 });
    expect(harness.sink!.move).toHaveBeenCalledTimes(1);
    harness.down({ pointerId: 8, clientX: 300, clientY: 300 }); // second finger
    expect(harness.sink!.cancel).toHaveBeenCalledTimes(1);
    expect(harness.host.beginGesture).toHaveBeenCalledTimes(1); // the pinch's bracket
    harness.move({ pointerId: 8, clientX: 400, clientY: 400 });
    harness.frame();
    expect(harness.host.zoomAround).toHaveBeenCalled(); // span grew → zoom applied
  });

  it('a pinch ends at its last COHERENT frame — no mixed-freshness flush', () => {
    const harness = controllerHarness({ sink: false });
    harness.down({ pointerId: 7, clientX: 100, clientY: 300 });
    harness.down({ pointerId: 8, clientX: 300, clientY: 300 });
    harness.move({ pointerId: 8, clientX: 400, clientY: 300 });
    harness.frame();
    expect(harness.host.zoomAround).toHaveBeenCalledTimes(1);
    harness.move({ pointerId: 8, clientX: 500, clientY: 300 }); // no frame after this…
    harness.up({ pointerId: 8, clientX: 500, clientY: 300 });
    // …and the lift adds nothing: the release position is fresh but the other
    // finger's is stale, and a centroid of two instants must never write the
    // camera. The sub-frame remainder is discarded, like the platform does.
    expect(harness.host.zoomAround).toHaveBeenCalledTimes(1);
    expect(harness.host.endGesture).not.toHaveBeenCalled(); // finger 7 still down: pan may continue
    harness.up({ pointerId: 7, clientX: 100, clientY: 300 });
    expect(harness.host.endGesture).toHaveBeenCalledTimes(1);
  });

  it('a touch-down while the camera is moving is a CATCH: no tap forwards', () => {
    const harness = controllerHarness({ inMotion: true });
    harness.down({ clientX: 40, clientY: 40 });
    expect(harness.host.beginGesture).toHaveBeenCalledTimes(1); // the catch itself
    harness.advance(50);
    harness.up({ clientX: 40, clientY: 40 });
    expect(harness.sink!.down).not.toHaveBeenCalled();
    expect(harness.host.doubleTapZoom).not.toHaveBeenCalled();
    expect(harness.host.endGesture).toHaveBeenCalledTimes(1);
  });

  it('wheel: ctrl zooms through the classifier, plain wheel pans', () => {
    const harness = controllerHarness({ sink: false });
    harness.wheel({ ctrlKey: true, clientX: 50, clientY: 60 });
    expect(harness.host.zoomAround).toHaveBeenCalledWith({ x: 50, y: 60 }, 1.2);
    harness.wheel({ deltaY: 40, deltaX: 4 });
    expect(harness.host.panBy).toHaveBeenCalledWith(-4, -40);
  });

  it('detach mid-gesture balances the open camera bracket', () => {
    const harness = controllerHarness({ sink: false });
    harness.down({ clientX: 0, clientY: 0 });
    harness.move({ clientX: 50, clientY: 50 });
    harness.detach();
    expect(harness.host.endGesture).toHaveBeenCalledTimes(1);
  });

  it('pointercancel discards without committing a fling', () => {
    const harness = controllerHarness({ sink: false });
    harness.down({ clientX: 0, clientY: 0 });
    for (let i = 1; i <= 5; i++) {
      harness.advance(16);
      harness.move({ clientX: 0, clientY: -i * 40 });
    }
    harness.pointerCancel({});
    expect(harness.host.fling).not.toHaveBeenCalled();
    expect(harness.host.endGesture).toHaveBeenCalledTimes(1);
  });
});

describe('pinch release identity (a pinch stays a pinch)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('asymmetric release: the leftover finger neither pans nor flings', () => {
    const harness = controllerHarness({ sink: false });
    harness.down({ pointerId: 7, clientX: 150, clientY: 300 });
    harness.down({ pointerId: 8, clientX: 250, clientY: 300 });
    // pinch out with real velocity on both fingers
    for (let i = 1; i <= 5; i++) {
      harness.advance(16);
      harness.move({ pointerId: 7, clientX: 150 - i * 15, clientY: 300 });
      harness.move({ pointerId: 8, clientX: 250 + i * 15, clientY: 300 });
      harness.frame();
    }
    const pansBefore = harness.host.panBy.mock.calls.length;
    // finger 7 lifts; finger 8 rolls a few px while leaving, 30ms later
    harness.up({ pointerId: 7, clientX: 75, clientY: 300 });
    harness.advance(15);
    harness.move({ pointerId: 8, clientX: 332, clientY: 302 }); // release-roll < slop
    harness.frame();
    harness.advance(15);
    harness.up({ pointerId: 8, clientX: 334, clientY: 303 });
    // the roll produced no pan at all (the transition flush no-ops on a
    // stationary centroid) and no fling — a symmetric pinch ends still
    expect(harness.host.panBy.mock.calls.length).toBe(pansBefore);
    expect(harness.host.fling).not.toHaveBeenCalled();
    expect(harness.host.endGesture).toHaveBeenCalledTimes(1);
  });

  it('the leftover finger re-earns panning by crossing slop', () => {
    const harness = controllerHarness({ sink: false });
    harness.down({ pointerId: 7, clientX: 150, clientY: 300 });
    harness.down({ pointerId: 8, clientX: 250, clientY: 300 });
    harness.move({ pointerId: 8, clientX: 280, clientY: 300 });
    harness.frame();
    harness.up({ pointerId: 7, clientX: 150, clientY: 300 });
    harness.advance(180); // outlive the release-grace window: this is a continuation
    const pansBefore = harness.host.panBy.mock.calls.length;
    harness.move({ pointerId: 8, clientX: 285, clientY: 300 }); // 5px: still disarmed
    harness.frame();
    expect(harness.host.panBy.mock.calls.length).toBe(pansBefore);
    harness.move({ pointerId: 8, clientX: 320, clientY: 300 }); // 40px: re-engaged
    harness.move({ pointerId: 8, clientX: 340, clientY: 300 });
    harness.frame();
    expect(harness.host.panBy.mock.calls.length).toBeGreaterThan(pansBefore);
    harness.up({ pointerId: 8, clientX: 340, clientY: 300 });
    expect(harness.host.endGesture).toHaveBeenCalledTimes(1);
  });

  it('a FAST pinch release never scrolls: moving leftover finger inside the grace window', () => {
    const harness = controllerHarness({ sink: false });
    harness.down({ pointerId: 7, clientX: 250, clientY: 300 });
    harness.down({ pointerId: 8, clientX: 350, clientY: 300 });
    for (let i = 1; i <= 4; i++) {
      harness.advance(16);
      harness.move({ pointerId: 7, clientX: 250 - i * 20, clientY: 300 });
      harness.move({ pointerId: 8, clientX: 350 + i * 20, clientY: 300 });
      harness.frame();
    }
    const pans = harness.host.panBy.mock.calls.length;
    const zooms = harness.host.zoomAround.mock.calls.length;
    // fast release: finger 7 lifts mid-motion; finger 8 keeps flying 25px
    // (well past slop) and lifts 40ms later — all inside the grace window
    harness.up({ pointerId: 7, clientX: 170, clientY: 300 });
    harness.advance(20);
    harness.move({ pointerId: 8, clientX: 455, clientY: 302 });
    harness.frame();
    harness.advance(20);
    harness.up({ pointerId: 8, clientX: 460, clientY: 303 });
    expect(harness.host.panBy.mock.calls.length).toBe(pans); // not one pixel of scroll
    expect(harness.host.zoomAround.mock.calls.length).toBe(zooms);
    expect(harness.host.fling).not.toHaveBeenCalled(); // symmetric centroid: no glide
    expect(harness.host.endGesture).toHaveBeenCalledTimes(1);
  });

  it('a translating pinch GLIDES from its centroid velocity on release', () => {
    const harness = controllerHarness({ sink: false });
    harness.down({ pointerId: 7, clientX: 150, clientY: 400 });
    harness.down({ pointerId: 8, clientX: 250, clientY: 400 });
    // both fingers sweep upward together — the centroid has real velocity
    for (let i = 1; i <= 5; i++) {
      harness.advance(16);
      harness.move({ pointerId: 7, clientX: 150, clientY: 400 - i * 30 });
      harness.move({ pointerId: 8, clientX: 250, clientY: 400 - i * 30 });
      harness.frame();
    }
    harness.up({ pointerId: 7, clientX: 150, clientY: 250 });
    harness.advance(10);
    harness.up({ pointerId: 8, clientX: 250, clientY: 250 });
    expect(harness.host.fling).toHaveBeenCalledTimes(1);
    const [, vy] = harness.host.fling.mock.calls[0]!;
    expect(vy).toBeLessThan(-500); // upward, from the centroid trail
  });
});

describe("replay of Bob's recorded iPhone fast pinch (gesture-log.html capture)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('the exact recorded release produces zero scroll and zero fling', () => {
    // Verbatim from the device log: two fingers pinching out fast, finger A
    // flicking away as it lifts (t=93), finger B flying another ~50px for
    // 51ms before its own up — the asymmetric release that moves the true
    // centroid at ~800px/s while the span grows at ~5000px/s.
    const harness = controllerHarness({ sink: false });
    const fingerA = 7;
    const fingerB = 8;
    type Ev = [number, 'down' | 'move' | 'up', number, number, number];
    const events: Ev[] = [
      [0, 'down', fingerA, 146.7, 151],
      [24, 'down', fingerB, 234.3, 220],
      [24, 'move', fingerA, 146.7, 151],
      [27, 'move', fingerA, 123, 137.3],
      [27, 'move', fingerB, 254.7, 233.7],
      [27, 'move', fingerB, 254.7, 233.7],
      [43, 'move', fingerA, 97.3, 119.3],
      [43, 'move', fingerB, 291, 248],
      [60, 'move', fingerA, 56, 97.3],
      [60, 'move', fingerB, 331.3, 268.7],
      [77, 'move', fingerA, 7, 74],
      [77, 'move', fingerB, 353.3, 300.7],
      [93, 'up', fingerA, 5, 72],
      [94, 'move', fingerB, 358.3, 316],
      [96, 'move', fingerB, 360.3, 329.3],
      [111, 'move', fingerB, 364, 347.3],
      [127, 'move', fingerB, 374.7, 356.3],
      [144, 'move', fingerB, 377.3, 358.3],
      [144, 'up', fingerB, 379.3, 360.3],
    ];
    let clock = 0;
    let pansAtLift = -1;
    let zoomsAtLift = -1;
    for (const [time, kind, id, x, y] of events) {
      if (time > clock) {
        harness.advance(time - clock);
        clock = time;
      }
      const payload = { pointerId: id, clientX: x, clientY: y };
      if (kind === 'down') harness.down(payload);
      else if (kind === 'move') harness.move(payload);
      else harness.up(payload);
      harness.frame(); // pump at least as often as the device did — conservative
      if (kind === 'up' && id === fingerA) {
        pansAtLift = harness.host.panBy.mock.calls.length;
        zoomsAtLift = harness.host.zoomAround.mock.calls.length;
      }
    }
    // after finger A lifted: Not one camera write from finger B's 50px of
    // release flight, and no fling — the span rate dwarfed the centroid rate
    expect(harness.host.panBy.mock.calls.length).toBe(pansAtLift);
    expect(harness.host.zoomAround.mock.calls.length).toBe(zoomsAtLift);
    expect(harness.host.fling).not.toHaveBeenCalled();
    expect(harness.host.endGesture).toHaveBeenCalledTimes(1);
  });
});
