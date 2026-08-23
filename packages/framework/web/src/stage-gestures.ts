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
  beginGesture(options?: { elastic?: boolean }): void;
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
  /**
   * Touch-consent pre-flight, asked at touch-down BEFORE the contact is
   * classified: does a tool have standing to own this contact? True when the
   * armed tool takes fingers wholesale (a drawing tool) or something under
   * the point claims its drags (a selected annotation's body or handles).
   * True routes the whole contact to {@link down}/{@link move}/{@link up} —
   * where a second finger still cancels it into a pinch. Must be a pure
   * read. Absent = never; the contact navigates.
   */
  claimsPoint?(e: PointerEvent): boolean;
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
  const PINCH_RELEASE_GRACE_MS = 160; // leftover finger must OUTLIVE the release
  const SETTLE_SPEED = 0.12; // px/ms — below this the leftover finger has SETTLED

  const pointers = new Map<number, Tracked>();
  let mode: Mode = 'idle';
  let began = false; // a host gesture transaction is open
  let suppressTap = false; // this contact CAUGHT a moving camera — never a tap
  let touchToolGesture = false; // 'tool' mode entered via touch long-press
  let downEvent: PointerEvent | null = null; // first touch's down, for tap/long-press forwarding
  let longPressTimer: ReturnType<typeof setTimeout> | null = null;
  let panId = -1;
  // A pan is ARMED once its finger has crossed slop. Fresh touches arm on the
  // pending→pan transition; the finger LEFT OVER when a pinch ends starts
  // DISARMED — a gesture's identity persists through its release, so the
  // leftover contact must re-earn pan-hood exactly like a new finger would.
  // While disarmed, its micro-rolls neither pan nor pollute the velocity
  // trail (which still holds the pinch's CENTROID motion — the momentum a
  // compound gesture actually has). For a GRACE window after the transition
  // the slop base FOLLOWS the finger: in a fast release the leftover finger
  // is still genuinely moving, and distance alone cannot tell that from a
  // deliberate continuation — only outliving the release window can.
  let panArmed = true;
  let panGraceUntil = 0;
  let graceSample = { t: 0, x: 0, y: 0 }; // leftover finger's last observed sample
  // iOS-visible seam: real WebKit can deliver a trailing gesturechange after
  // the last pointerup of a pinch — with no touches left, the desktop-trackpad
  // path would apply a stray end-of-pinch zoom. Any RECENT touch activity
  // therefore suppresses gesture events; desktop trackpads never have any.
  let lastTouchAt = -Infinity;

  // rAF application state
  let frame = 0;
  let dirty = false;
  let lastApplied = { x: 0, y: 0 }; // pan focal point, client px
  let lastSpan = 0;

  // velocity trail of the pan focal point (finger, or pinch centroid)
  let trail: Array<{ t: number; x: number; y: number }> = [];
  // the pinch's SPAN trail, sampled beside the centroid: at release it decides
  // the gesture's CHARACTER. A fast pinch release has asymmetric finger
  // speeds (the lifting finger flicks away), which moves the TRUE centroid at
  // hundreds of px/s — physically real, but zoom-release noise the platform
  // ignores. Fling only when the centroid rate DOMINATES the span rate
  // (a two-finger pan); a zoom-dominant release ends still.
  let spanTrail: Array<{ t: number; x: number; y: number }> = [];

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
  const begin = (elastic = false) => {
    if (!began) {
      began = true;
      // touch contacts are elastic (rubber-band past the clamp); mouse drags
      // stay rigid — the desktop convention
      host.beginGesture(elastic ? { elastic: true } : undefined);
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
    spanTrail = [];
    dirty = false;
    panId = -1;
    panArmed = true;
    panGraceUntil = 0;
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

  // ── the application step, shared by the frame loop AND the release paths —
  // a release must flush whatever the last tick hadn't applied yet, or a fast
  // flick loses its final sub-frame of travel and a pinch its last span step.
  const flushPanTo = (x: number, y: number) => {
    const dx = x - lastApplied.x;
    const dy = y - lastApplied.y;
    if (dx !== 0 || dy !== 0) host.panBy(dx, dy);
    lastApplied = { x, y };
    dirty = false;
  };
  const flushPinch = (ax: number, ay: number, bx: number, by: number) => {
    const cx = (ax + bx) / 2;
    const cy = (ay + by) / 2;
    const span = Math.hypot(ax - bx, ay - by);
    const dx = cx - lastApplied.x;
    const dy = cy - lastApplied.y;
    if (dx !== 0 || dy !== 0) host.panBy(dx, dy);
    if (zoomGestures && span > MIN_PINCH_SPAN && lastSpan > MIN_PINCH_SPAN && span !== lastSpan) {
      host.zoomAround(vpt(cx, cy), span / lastSpan);
    }
    // The centroid + span trails sample HERE — once per applied frame, where
    // both fingers are read coherently. Per-event sampling zig-zags (fingers
    // report sequentially, so each single-finger move fakes a half-step of
    // centroid motion) and manufactures phantom release velocity. The span
    // trail is the release gate's evidence of the gesture's CHARACTER.
    pushSample(cx, cy);
    spanTrail.push({ t: performance.now(), x: span, y: 0 });
    if (spanTrail.length > 16) spanTrail.shift();
    lastApplied = { x: cx, y: cy };
    lastSpan = span;
    dirty = false;
  };

  // ── the per-frame application (one camera write per frame) ────────────────
  const tick = () => {
    frame = 0;
    if (mode === 'pan' || mode === 'mousedrag') {
      const p = pointers.get(panId);
      if (p && dirty) flushPanTo(p.x, p.y);
      frame = requestAnimationFrame(tick);
    } else if (mode === 'pinch') {
      const [a, b] = touches();
      if (a && b && dirty) flushPinch(a.x, a.y, b.x, b.y);
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
    if (kind === 'touch') lastTouchAt = performance.now();
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
        // Consent pre-flight — but a MOVING camera always catches first: while
        // content flies under the finger, the touch means "stop", never "grab
        // whatever happens to pass beneath it".
        const moving = host.cameraInMotion();
        if (!moving && sink?.claimsPoint?.(e)) {
          // A tool owns this contact from the first pixel (selected-annotation
          // drag, or an armed drawing tool). No camera transaction — this is
          // not a navigation gesture; a second finger converts it to a pinch
          // via the 'tool' branch (sink.cancel), exactly like a long-press.
          mode = 'tool';
          touchToolGesture = true;
          sink.down(e, 1);
          break;
        }
        mode = 'pending';
        downEvent = e;
        suppressTap = moving; // a catch, not a tap
        begin(true); // stops any fling/tween under the finger
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
        begin(true);
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
    if (p.kind === 'touch') lastTouchAt = performance.now();
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
        if (p.id !== panId) break;
        if (!panArmed) {
          // pinch-leftover contact. Inside the release-grace window the slop
          // base follows the finger — a fast release keeps moving and must
          // never accumulate distance; only a contact that OUTLIVES the
          // window can re-earn panning by crossing slop from where it
          // settled.
          const nowT = performance.now();
          if (nowT < panGraceUntil) {
            // a finger that SETTLES (speed drops) inside the window is a
            // continuation taking hold — end the grace early so a deliberate
            // pause-then-drag stays responsive
            const dt = nowT - graceSample.t;
            if (dt >= 8) {
              const speed = Math.hypot(p.x - graceSample.x, p.y - graceSample.y) / dt;
              graceSample = { t: nowT, x: p.x, y: p.y };
              if (speed < SETTLE_SPEED) panGraceUntil = 0;
            }
            p.downX = p.x;
            p.downY = p.y;
            break;
          }
          if (Math.hypot(p.x - p.downX, p.y - p.downY) <= SLOP) break;
          panArmed = true;
          lastApplied = { x: p.x, y: p.y }; // absorb, like any fresh pan
          trail = [];
          spanTrail = [];
        }
        pushSample(p.x, p.y);
        dirty = true;
        break;
      case 'pinch':
        // centroid samples are taken per applied FRAME (see flushPinch) —
        // per-event sampling here would zig-zag between the two fingers
        dirty = true;
        break;
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
    panArmed = false; // leftover contact re-earns pan-hood via slop
    panGraceUntil = performance.now() + PINCH_RELEASE_GRACE_MS;
    graceSample = { t: performance.now(), x: rest[0].x, y: rest[0].y };
    rest[0].downX = rest[0].x;
    rest[0].downY = rest[0].y;
    lastApplied = { x: rest[0].x, y: rest[0].y };
    trail = [];
    dirty = false;
    return true;
  };

  const onUp = (e: PointerEvent) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    if (p.kind === 'touch') lastTouchAt = performance.now();
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
        if (!panArmed) {
          // The pinch's OTHER finger leaving: the gesture ends as a pinch.
          // No flush (release-rolls are noise). Glide is CHARACTER-gated: a
          // human fast release moves the true centroid (the lifting finger
          // flicks away), so centroid velocity alone lies — the glide fires
          // only when the centroid rate DOMINATES the span rate (a
          // two-finger pan), never on a zoom-dominant release.
          const now = performance.now();
          const v = computeReleaseVelocity(trail, now);
          const vs = computeReleaseVelocity(spanTrail, now);
          end(); // close the bracket first — endGesture owns the elastic settle
          if (v) {
            const speed = Math.hypot(v.vx, v.vy);
            if (speed >= FLING_MIN && speed > Math.abs(vs?.vx ?? 0)) host.fling(v.vx, v.vy);
          }
          toIdle();
          break;
        }
        flushPanTo(e.clientX, e.clientY); // apply the final sub-frame of travel
        pushSample(e.clientX, e.clientY);
        end();
        maybeFling();
        toIdle();
        break;
      }
      case 'pinch': {
        const rest = touches();
        if (rest.length === 1) {
          // The pinch ends AT ITS LAST COHERENT FRAME. No flush here: the
          // lifting finger's release position is fresh but the other one's is
          // stale (its move for this window may not have arrived), and a
          // centroid of two instants is fiction — in a fast pinch that skewed
          // write was the visible end-of-pinch hop, and its poisoned trail
          // sample the phantom fling. Only coherent finger-pairs write the
          // camera; the sub-frame remainder is discarded, as the platform
          // recognizers do. The remaining contact gets a DISARMED pan with
          // the centroid trail preserved and a release-grace window armed.
          mode = 'pan';
          panId = rest[0].id;
          panArmed = false;
          panGraceUntil = performance.now() + PINCH_RELEASE_GRACE_MS;
          graceSample = { t: performance.now(), x: rest[0].x, y: rest[0].y };
          rest[0].downX = rest[0].x;
          rest[0].downY = rest[0].y;
          lastApplied = { x: rest[0].x, y: rest[0].y };
          dirty = false;
          break;
        }
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
        flushPanTo(e.clientX, e.clientY);
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
    // iOS: the pointer path owns touch pinches — and a TRAILING gesturechange
    // can arrive after the last pointerup, so suppression keys on RECENT
    // touch activity, not just live contacts. Desktop trackpads have none.
    if (touches().length > 0 || performance.now() - lastTouchAt < 500) return;
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
