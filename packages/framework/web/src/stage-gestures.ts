/**
 * Stage gesture controller — the ONE DOM input binding for a Stage surface,
 * shared by every framework adapter (React, Angular, …) so the feel can never
 * drift between them.
 *
 * The premise (see the stage plugin's camera doctrine): desktop inputs arrive
 * with physics already applied by the OS — momentum lives in the wheel stream,
 * a trackpad pinch is one pre-arbitrated gesture stream. Touch arrives RAW:
 * with `touch-action: none` the platform scroller is out of the loop, so the
 * ballistics (velocity → fling) and the arbitration (is this contact a scroll,
 * a pinch, a tap, or a tool gesture?) must be synthesized here.
 *
 * Arbitration is MODALITY-AWARE:
 *   - touch  — navigation-first: one finger pans (whatever tool is armed), two
 *     fingers pinch-zoom around their centroid, release velocity flings, a tap
 *     forwards as a click, a double-tap zoom-toggles, a long-press hands the
 *     gesture to the interaction hub (text selection), and a second finger
 *     landing mid-tool-gesture CANCELS it into a pinch (the Notes/Procreate
 *     convention).
 *   - mouse/pen — tool-first, exactly the pre-existing behavior: with a hub,
 *     every down/move/up forwards (pan is the pan tool's job); without one,
 *     dragging pans. Wheel and Safari-trackpad gesture events are unchanged.
 *
 * Camera writes are rAF-COALESCED: pointer events only update gesture state;
 * one animation-frame tick applies at most one pan and one zoom per frame,
 * inside the host's begin/endGesture transaction. Events may arrive at 120 Hz;
 * the camera moves at display rate.
 *
 * Dependency note: this module speaks to the stage through the STRUCTURAL
 * {@link StageGestureHost} interface (satisfied by `StageCapability`) and to
 * the interaction hub through {@link StageGestureSink} (a closure the adapter
 * builds) — @embedpdf/web stays free of plugin imports, per the layering law.
 */

export type StagePointerKind = 'mouse' | 'pen' | 'touch';

/** What the controller needs from the camera — `StageCapability` satisfies it. */
export interface StageGestureHost {
  panBy(dxScreen: number, dyScreen: number): void;
  zoomAround(screenPt: { x: number; y: number }, factor: number): void;
  beginGesture(): void;
  endGesture(): void;
  /** Momentum pan from a release velocity in screen px/s. */
  fling(velocityX: number, velocityY: number): void;
  /** True while a tween/fling runs — a touch-down then is a "catch", not a tap. */
  cameraInMotion(): boolean;
  doubleTapZoom(screenPt: { x: number; y: number }): void;
}

/**
 * Where non-navigation gestures go — the adapter's bridge to the interaction
 * hub. Every callback receives the ORIGINAL PointerEvent so the adapter can
 * resolve pages/points exactly as it always has. Omit the sink entirely for a
 * hub-less (built-in pan) stage.
 */
export interface StageGestureSink {
  down(e: PointerEvent, clickCount: number): void;
  move(e: PointerEvent): void;
  up(e: PointerEvent): void;
  /** The gesture was taken over by navigation (second finger → pinch) or
   *  cancelled by the system — abort, don't commit. */
  cancel(e: PointerEvent): void;
  /** Pointer travel with no gesture in flight — cursor feedback. */
  hover(e: PointerEvent): void;
  /** A touch press held still: hand the gesture to the hub (the adapter
   *  typically forwards it as a word-select down). Subsequent move/up arrive
   *  via {@link move}/{@link up}. */
  longPress(e: PointerEvent): void;
}

/** The wheel fields the zoom classifier reads (plugin-stage's `WheelSample`). */
export interface StageWheelSample {
  deltaY: number;
  deltaMode: number;
  ctrlKey: boolean;
  metaKey: boolean;
}

export interface StageGestureOptions {
  /** Ambient zoom (wheel-zoom, pinch-zoom, double-tap zoom). Off: zoom wheels
   *  fall through to pan and pinches pan without zooming — but are still
   *  swallowed, never page-zooming the browser. Default true. */
  zoomGestures?: boolean;
  /** The wheel → zoom-factor classifier (inject plugin-stage's
   *  `wheelZoomFactor`; injected so this module stays plugin-free). */
  wheelZoomFactor: (sample: StageWheelSample) => number;
  /** Tool routing for non-navigation gestures; omit for built-in-pan stages. */
  sink?: StageGestureSink | null;
  /** Touch press duration that becomes a long-press (ms). Default 450. */
  longPressMs?: number;
  /** Finger travel below which a touch stays a tap/press (px). Default 10. */
  tapSlopPx?: number;
  /** Max gap between taps for a double-tap (ms). Default 300. */
  doubleTapMs?: number;
  /** Release speed below which no fling starts (px/s). Default 50. */
  flingMinVelocity?: number;
}

/**
 * Release velocity from a trail of pointer samples: the mean velocity over the
 * trailing `windowMs` (first-to-last inside the window). Null when the trail is
 * too thin or too stale to trust — the standard "held still, then let go"
 * case, which must NOT fling. Pure; exported for tests.
 */
export function computeReleaseVelocity(
  samples: ReadonlyArray<{ t: number; x: number; y: number }>,
  now: number,
  windowMs = 100,
): { vx: number; vy: number } | null {
  let firstIdx = -1;
  for (let i = 0; i < samples.length; i++) {
    if (now - samples[i].t <= windowMs) {
      firstIdx = i;
      break;
    }
  }
  if (firstIdx < 0 || firstIdx === samples.length - 1) return null;
  const first = samples[firstIdx];
  const last = samples[samples.length - 1];
  const dt = last.t - first.t;
  if (dt < 10) return null;
  return { vx: ((last.x - first.x) / dt) * 1000, vy: ((last.y - first.y) / dt) * 1000 };
}

interface Tracked {
  id: number;
  kind: StagePointerKind;
  x: number;
  y: number;
  downX: number;
  downY: number;
}

type Mode = 'idle' | 'pending' | 'pan' | 'pinch' | 'tool' | 'mousedrag';

/** Attach the gesture controller to a Stage container. Returns the detach fn. */
export function createStageGestureController(
  el: HTMLElement,
  host: StageGestureHost,
  options: StageGestureOptions,
): () => void {
  const zoomGestures = options.zoomGestures ?? true;
  const sink = options.sink ?? null;
  const LONG_PRESS_MS = options.longPressMs ?? 450;
  const SLOP = options.tapSlopPx ?? 10;
  const DOUBLE_TAP_MS = options.doubleTapMs ?? 300;
  const DOUBLE_TAP_RADIUS = 25;
  const FLING_MIN = options.flingMinVelocity ?? 50;
  const MIN_PINCH_SPAN = 20; // px — below this a span ratio is mostly noise

  const pointers = new Map<number, Tracked>();
  let mode: Mode = 'idle';
  let began = false; // a host gesture transaction is open
  let suppressTap = false; // this contact CAUGHT a moving camera — never a tap
  let touchToolGesture = false; // 'tool' mode entered via touch long-press
  let downEvent: PointerEvent | null = null; // first touch's down, for tap/long-press forwarding
  let longPressTimer: ReturnType<typeof setTimeout> | null = null;
  let panId = -1;

  // rAF application state
  let frame = 0;
  let dirty = false;
  let lastApplied = { x: 0, y: 0 }; // pan focal point, client px
  let lastSpan = 0;

  // velocity trail of the pan focal point (finger, or pinch centroid)
  let trail: Array<{ t: number; x: number; y: number }> = [];

  // tap-pair state for double-tap
  let lastTapT = 0;
  let lastTapX = 0;
  let lastTapY = 0;

  // multi-click counter for mouse/pen tool downs (parity with the adapters'
  // previous createClickCounter: 400 ms / 6 px)
  let mLast = 0;
  let mX = 0;
  let mY = 0;
  let mCount = 0;
  const clickCount = (e: PointerEvent): number => {
    const now = Date.now();
    mCount =
      now - mLast <= 400 && Math.hypot(e.clientX - mX, e.clientY - mY) <= 6 ? mCount + 1 : 1;
    mLast = now;
    mX = e.clientX;
    mY = e.clientY;
    return mCount;
  };

  const vpt = (clientX: number, clientY: number) => {
    const r = el.getBoundingClientRect();
    return { x: clientX - r.left, y: clientY - r.top };
  };
  const touches = (): Tracked[] => {
    const out: Tracked[] = [];
    pointers.forEach((p) => {
      if (p.kind === 'touch') out.push(p);
    });
    return out;
  };

  const clearLongPress = () => {
    if (longPressTimer !== null) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  };
  const stopFrames = () => {
    if (frame) {
      cancelAnimationFrame(frame);
      frame = 0;
    }
  };
  const begin = () => {
    if (!began) {
      began = true;
      host.beginGesture();
    }
  };
  const end = () => {
    if (began) {
      began = false;
      host.endGesture();
    }
  };
  const toIdle = () => {
    mode = 'idle';
    downEvent = null;
    touchToolGesture = false;
    trail = [];
    dirty = false;
    panId = -1;
    clearLongPress();
    stopFrames();
  };
  const pushSample = (x: number, y: number) => {
    trail.push({ t: performance.now(), x, y });
    if (trail.length > 16) trail.shift();
  };
  const maybeFling = () => {
    const v = computeReleaseVelocity(trail, performance.now());
    if (v && Math.hypot(v.vx, v.vy) >= FLING_MIN) host.fling(v.vx, v.vy);
  };

  // ── the per-frame application (one camera write per frame) ────────────────
  const tick = () => {
    frame = 0;
    if (mode === 'pan' || mode === 'mousedrag') {
      const p = pointers.get(panId);
      if (p && dirty) {
        host.panBy(p.x - lastApplied.x, p.y - lastApplied.y);
        lastApplied = { x: p.x, y: p.y };
        dirty = false;
      }
      frame = requestAnimationFrame(tick);
    } else if (mode === 'pinch') {
      const [a, b] = touches();
      if (a && b && dirty) {
        const cx = (a.x + b.x) / 2;
        const cy = (a.y + b.y) / 2;
        const span = Math.hypot(a.x - b.x, a.y - b.y);
        host.panBy(cx - lastApplied.x, cy - lastApplied.y);
        if (zoomGestures && span > MIN_PINCH_SPAN && lastSpan > MIN_PINCH_SPAN) {
          const factor = span / lastSpan;
          if (factor !== 1) host.zoomAround(vpt(cx, cy), factor);
        }
        lastApplied = { x: cx, y: cy };
        lastSpan = span;
        dirty = false;
      }
      frame = requestAnimationFrame(tick);
    }
  };
  const ensureFrames = () => {
    if (!frame) frame = requestAnimationFrame(tick);
  };

  const enterPinch = () => {
    const [a, b] = touches();
    if (!a || !b) return;
    mode = 'pinch';
    lastApplied = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    lastSpan = Math.hypot(a.x - b.x, a.y - b.y);
    trail = [];
    dirty = false;
    ensureFrames();
  };

  const onLongPress = () => {
    longPressTimer = null;
    if (mode !== 'pending' || !downEvent || !sink) return;
    // The camera transaction closes; the tool owns the rest of this contact.
    end();
    mode = 'tool';
    touchToolGesture = true;
    sink.longPress(downEvent);
  };

  // ── listeners ─────────────────────────────────────────────────────────────
  const onDown = (e: PointerEvent) => {
    const kind = (e.pointerType || 'mouse') as StagePointerKind;
    if (kind !== 'touch') {
      if (kind === 'mouse' && e.button !== 0) return;
      if (mode !== 'idle') return; // an active gesture owns the surface
      pointers.set(e.pointerId, {
        id: e.pointerId,
        kind,
        x: e.clientX,
        y: e.clientY,
        downX: e.clientX,
        downY: e.clientY,
      });
      if (sink) {
        // tool-first, exactly the pre-existing hub behavior
        mode = 'tool';
        sink.down(e, clickCount(e));
      } else {
        mode = 'mousedrag';
        begin();
        panId = e.pointerId;
        lastApplied = { x: e.clientX, y: e.clientY };
        ensureFrames();
      }
      return;
    }

    // touch
    switch (mode) {
      case 'idle': {
        pointers.set(e.pointerId, {
          id: e.pointerId,
          kind,
          x: e.clientX,
          y: e.clientY,
          downX: e.clientX,
          downY: e.clientY,
        });
        mode = 'pending';
        downEvent = e;
        suppressTap = host.cameraInMotion(); // a catch, not a tap
        begin(); // stops any fling/tween under the finger
        trail = [];
        pushSample(e.clientX, e.clientY);
        clearLongPress();
        if (sink && !suppressTap) longPressTimer = setTimeout(onLongPress, LONG_PRESS_MS);
        break;
      }
      case 'pending':
      case 'pan': {
        pointers.set(e.pointerId, {
          id: e.pointerId,
          kind,
          x: e.clientX,
          y: e.clientY,
          downX: e.clientX,
          downY: e.clientY,
        });
        clearLongPress();
        enterPinch();
        break;
      }
      case 'tool': {
        // A second finger during a TOUCH tool gesture cancels it into a pinch
        // (the platform convention). Mouse tool gestures ignore stray touches.
        if (!touchToolGesture) return;
        sink?.cancel(e);
        touchToolGesture = false;
        pointers.set(e.pointerId, {
          id: e.pointerId,
          kind,
          x: e.clientX,
          y: e.clientY,
          downX: e.clientX,
          downY: e.clientY,
        });
        begin();
        enterPinch();
        break;
      }
      case 'pinch':
      case 'mousedrag':
        return; // ignore extra contacts
    }
  };

  const onWindowMove = (e: PointerEvent) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    p.x = e.clientX;
    p.y = e.clientY;
    switch (mode) {
      case 'pending': {
        pushSample(p.x, p.y);
        if (Math.hypot(p.x - p.downX, p.y - p.downY) > SLOP) {
          clearLongPress();
          mode = 'pan';
          panId = p.id;
          lastApplied = { x: p.x, y: p.y }; // absorb the slop, like a scroller
          ensureFrames();
        }
        break;
      }
      case 'pan':
        if (p.id === panId) {
          pushSample(p.x, p.y);
          dirty = true;
        }
        break;
      case 'pinch': {
        const [a, b] = touches();
        if (a && b) pushSample((a.x + b.x) / 2, (a.y + b.y) / 2);
        dirty = true;
        break;
      }
      case 'tool':
        sink?.move(e);
        break;
      case 'mousedrag':
        if (p.id === panId) dirty = true;
        break;
      case 'idle':
        break;
    }
  };

  // Hover (cursor feedback) — only with no gesture in flight, and only from
  // the element itself, matching the previous adapters.
  const onHoverMove = (e: PointerEvent) => {
    if (mode === 'idle' && sink) sink.hover(e);
  };

  const backToSingleFinger = (): boolean => {
    const rest = touches();
    if (rest.length !== 1) return false;
    mode = 'pan';
    panId = rest[0].id;
    lastApplied = { x: rest[0].x, y: rest[0].y };
    trail = [];
    dirty = false;
    return true;
  };

  const onUp = (e: PointerEvent) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    pointers.delete(e.pointerId);
    switch (mode) {
      case 'pending': {
        // Slop never exceeded, timer never fired: a tap (or a catch).
        clearLongPress();
        end();
        const now = performance.now();
        const isDouble =
          now - lastTapT <= DOUBLE_TAP_MS &&
          Math.hypot(e.clientX - lastTapX, e.clientY - lastTapY) <= DOUBLE_TAP_RADIUS;
        if (suppressTap) {
          lastTapT = 0; // a catch never counts toward a double-tap
        } else if (zoomGestures && isDouble) {
          lastTapT = 0;
          host.doubleTapZoom(vpt(e.clientX, e.clientY));
        } else {
          lastTapT = now;
          lastTapX = e.clientX;
          lastTapY = e.clientY;
          if (sink && downEvent) {
            // The whole click, delivered at release — tools see exactly the
            // down/up pair they would from a mouse.
            sink.down(downEvent, 1);
            sink.up(e);
          }
        }
        toIdle();
        break;
      }
      case 'pan': {
        pushSample(e.clientX, e.clientY);
        end();
        maybeFling();
        toIdle();
        break;
      }
      case 'pinch': {
        if (backToSingleFinger()) break;
        end();
        maybeFling();
        toIdle();
        break;
      }
      case 'tool': {
        sink?.up(e);
        toIdle();
        break;
      }
      case 'mousedrag': {
        if (p.id !== panId) break;
        end();
        toIdle();
        break;
      }
      case 'idle':
        break;
    }
  };

  const onCancel = (e: PointerEvent) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    pointers.delete(e.pointerId);
    if (mode === 'tool') {
      sink?.cancel(e);
      toIdle();
      return;
    }
    if (mode === 'pinch' && backToSingleFinger()) return;
    end();
    toIdle();
  };

  // Wheel is ambient navigation in BOTH modes: ctrl/meta zooms (classified per
  // input by the injected wheelZoomFactor), else scrolls. With zoom gestures
  // off, a zoom-wheel falls through to ordinary pan.
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    if (zoomGestures && (e.ctrlKey || e.metaKey)) {
      host.zoomAround(vpt(e.clientX, e.clientY), options.wheelZoomFactor(e));
    } else {
      const dx = e.shiftKey ? e.deltaY : e.deltaX;
      const dy = e.shiftKey ? e.deltaX : e.deltaY;
      host.panBy(-dx, -dy);
    }
  };

  // Safari's proprietary gesture events. On DESKTOP Safari they are the only
  // trace of a trackpad pinch — convert the absolute scale to per-event ratios.
  // On iOS they fire ALONGSIDE per-finger pointer events; there the pointer
  // path owns the pinch and these are preventDefault-ed only (a pinch over the
  // stage must never page-zoom Safari). The guard is live touch contacts.
  let lastScale = 1;
  const onGestureStart = (e: Event) => {
    e.preventDefault();
    lastScale = (e as unknown as { scale?: number }).scale ?? 1;
  };
  const onGestureChange = (e: Event) => {
    e.preventDefault();
    if (touches().length > 0) return; // iOS: the pointer path owns this pinch
    const g = e as unknown as { scale?: number; clientX: number; clientY: number };
    const scale = g.scale ?? 1;
    if (zoomGestures && scale > 0) {
      host.zoomAround(vpt(g.clientX, g.clientY), scale / lastScale);
    }
    lastScale = scale;
  };

  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onHoverMove);
  window.addEventListener('pointermove', onWindowMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onCancel);
  el.addEventListener('wheel', onWheel, { passive: false });
  const hasGestureEvents = 'GestureEvent' in window;
  if (hasGestureEvents) {
    el.addEventListener('gesturestart', onGestureStart);
    el.addEventListener('gesturechange', onGestureChange);
    el.addEventListener('gestureend', onGestureStart); // reset the base
  }

  return () => {
    el.removeEventListener('pointerdown', onDown);
    el.removeEventListener('pointermove', onHoverMove);
    window.removeEventListener('pointermove', onWindowMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onCancel);
    el.removeEventListener('wheel', onWheel);
    if (hasGestureEvents) {
      el.removeEventListener('gesturestart', onGestureStart);
      el.removeEventListener('gesturechange', onGestureChange);
      el.removeEventListener('gestureend', onGestureStart);
    }
    clearLongPress();
    stopFrames();
    end(); // balance an open transaction on unmount
  };
}
