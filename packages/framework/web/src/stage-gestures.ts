/**
 * Stage gesture controller — the one DOM input binding for a Stage surface,
 * shared by every framework adapter (React, Angular, …) so the feel can never
 * drift between them.
 *
 * The premise (see the stage plugin's camera doctrine): desktop inputs arrive
 * with physics already applied by the OS — momentum lives in the wheel stream,
 * a trackpad pinch is one pre-arbitrated gesture stream. Touch arrives raw:
 * with `touch-action: none` the platform scroller is out of the loop, so the
 * ballistics (velocity → fling) and the arbitration (is this contact a scroll,
 * a pinch, a tap, or a tool gesture?) must be synthesized here.
 *
 * Arbitration is modality-aware:
 *   - touch  — navigation-first: one finger pans (whatever tool is armed), two
 *     fingers pinch-zoom around their centroid, release velocity flings, a tap
 *     forwards as a click, a double-tap zoom-toggles, a long-press hands the
 *     gesture to the interaction hub (text selection), and a second finger
 *     landing mid-tool-gesture cancels it into a pinch (the Notes/Procreate
 *     convention).
 *   - mouse/pen — tool-first, exactly the pre-existing behavior: with a hub,
 *     every down/move/up forwards (pan is the pan tool's job); without one,
 *     dragging pans. Wheel and Safari-trackpad gesture events are unchanged.
 *
 * Camera writes are rAF-coalesced: pointer events only update gesture state;
 * one animation-frame tick applies at most one pan and one zoom per frame,
 * inside the host's begin/endGesture transaction. Events may arrive at 120 Hz;
 * the camera moves at display rate.
 *
 * Dependency note: this module speaks to the stage through the structural
 * {@link StageGestureHost} interface (satisfied by `StageHostCapability`) and to
 * the interaction hub through {@link StageGestureSink} (a closure the adapter
 * builds) — @embedpdf/web stays free of plugin imports, per the layering law.
 */

import { wheelZoomFactor } from './wheel';

export type StagePointerKind = 'mouse' | 'pen' | 'touch';

/** What the controller needs from the camera — `StageHostCapability` satisfies it. */
export interface StageGestureHost {
  panBy(dxScreen: number, dyScreen: number): void;
  zoomAround(screenPt: { x: number; y: number }, factor: number): void;
  beginGesture(options?: { elastic?: boolean }): void;
  endGesture(): void;
  /** Momentum pan from a release velocity in screen px/s. */
  fling(velocityX: number, velocityY: number): void;
  /** True while a tween/fling runs — a touch-down then is a "catch", not a tap. */
  isMoving(): boolean;
  doubleTapZoom(screenPt: { x: number; y: number }): void;
}

/**
 * Where non-navigation gestures go — the adapter's bridge to the interaction
 * hub. Every callback receives the original PointerEvent so the adapter can
 * resolve pages/points exactly as it always has. Omit the sink entirely for a
 * hub-less (built-in pan) stage.
 */
export interface StageGestureSink {
  down(event: PointerEvent, clickCount: number): void;
  move(event: PointerEvent): void;
  up(event: PointerEvent): void;
  /** The gesture was taken over by navigation (second finger → pinch) or
   *  cancelled by the system — abort, don't commit. */
  cancel(event: PointerEvent): void;
  /** Pointer travel with no gesture in flight — cursor feedback. */
  hover(event: PointerEvent): void;
  /** A touch press held still: hand the gesture to the hub (the adapter
   *  typically forwards it as a word-select down). Subsequent move/up arrive
   *  via {@link move}/{@link up}. */
  longPress(event: PointerEvent): void;
  /**
   * Touch-consent pre-flight, asked at touch-down before the contact is
   * classified: does a tool have standing to own this contact? True when the
   * armed tool takes fingers wholesale (a drawing tool) or something under
   * the point claims its drags (a selected annotation's body or handles).
   * True routes the whole contact to {@link down}/{@link move}/{@link up} —
   * where a second finger still cancels it into a pinch. Must be a pure
   * read. Absent = never; the contact navigates.
   */
  claimsPoint?(event: PointerEvent): boolean;
}

/** The wheel fields the zoom classifier reads (see `./wheel`'s `WheelSample`). */
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
  /** The wheel → zoom-factor classifier. Defaults to this package's
   *  `wheelZoomFactor` (browser wheel classification lives here, with the rest
   *  of the browser input handling); inject to override or to fake in tests. */
  wheelZoomFactor?: (sample: StageWheelSample) => number;
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
 * case, which must not fling. Pure; exported for tests.
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
  element: HTMLElement,
  host: StageGestureHost,
  options: StageGestureOptions,
): () => void {
  const zoomGestures = options.zoomGestures ?? true;
  const wheelZoom = options.wheelZoomFactor ?? wheelZoomFactor;
  const sink = options.sink ?? null;
  const LONG_PRESS_MS = options.longPressMs ?? 450;
  const SLOP = options.tapSlopPx ?? 10;
  const DOUBLE_TAP_MS = options.doubleTapMs ?? 300;
  const DOUBLE_TAP_RADIUS = 25;
  const FLING_MIN = options.flingMinVelocity ?? 50;
  const MIN_PINCH_SPAN = 20; // px — below this a span ratio is mostly noise
  const PINCH_RELEASE_GRACE_MS = 160; // leftover finger must outlive the release
  const SETTLE_SPEED = 0.12; // px/ms — below this the leftover finger has settled

  const pointers = new Map<number, Tracked>();
  let mode: Mode = 'idle';
  let began = false; // a host gesture transaction is open
  let suppressTap = false; // this contact caught a moving camera — never a tap
  let touchToolGesture = false; // 'tool' mode entered via touch long-press
  let downEvent: PointerEvent | null = null; // first touch's down, for tap/long-press forwarding
  let longPressTimer: ReturnType<typeof setTimeout> | null = null;
  let panId = -1;
  // A pan is armed once its finger has crossed slop. Fresh touches arm on the
  // pending→pan transition; the finger left over when a pinch ends starts
  // disarmed — a gesture's identity persists through its release, so the
  // leftover contact must re-earn pan-hood exactly like a new finger would.
  // While disarmed, its micro-rolls neither pan nor pollute the velocity
  // trail (which still holds the pinch's centroid motion — the momentum a
  // compound gesture actually has). For a grace window after the transition
  // the slop base follows the finger: in a fast release the leftover finger
  // is still genuinely moving, and distance alone cannot tell that from a
  // deliberate continuation — only outliving the release window can.
  let panArmed = true;
  let panGraceUntil = 0;
  let graceSample = { t: 0, x: 0, y: 0 }; // leftover finger's last observed sample
  // iOS-visible seam: real WebKit can deliver a trailing gesturechange after
  // the last pointerup of a pinch — with no touches left, the desktop-trackpad
  // path would apply a stray end-of-pinch zoom. Any recent touch activity
  // therefore suppresses gesture events; desktop trackpads never have any.
  let lastTouchAt = -Infinity;

  // rAF application state
  let frame = 0;
  let dirty = false;
  let lastApplied = { x: 0, y: 0 }; // pan focal point, client px
  let lastSpan = 0;

  // velocity trail of the pan focal point (finger, or pinch centroid)
  let trail: Array<{ t: number; x: number; y: number }> = [];
  // the pinch's span trail, sampled beside the centroid: at release it decides
  // the gesture's character. A fast pinch release has asymmetric finger
  // speeds (the lifting finger flicks away), which moves the true centroid at
  // hundreds of px/s — physically real, but zoom-release noise the platform
  // ignores. Fling only when the centroid rate dominates the span rate
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
  const clickCount = (event: PointerEvent): number => {
    const now = Date.now();
    mCount =
      now - mLast <= 400 && Math.hypot(event.clientX - mX, event.clientY - mY) <= 6
        ? mCount + 1
        : 1;
    mLast = now;
    mX = event.clientX;
    mY = event.clientY;
    return mCount;
  };

  const vpt = (clientX: number, clientY: number) => {
    const rect = element.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  };
  const touches = (): Tracked[] => {
    const out: Tracked[] = [];
    pointers.forEach((pointer) => {
      if (pointer.kind === 'touch') out.push(pointer);
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
    const velocity = computeReleaseVelocity(trail, performance.now());
    if (velocity && Math.hypot(velocity.vx, velocity.vy) >= FLING_MIN)
      host.fling(velocity.vx, velocity.vy);
  };

  // ── the application step, shared by the frame loop and the release paths —
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
    // The centroid + span trails sample here — once per applied frame, where
    // both fingers are read coherently. Per-event sampling zig-zags (fingers
    // report sequentially, so each single-finger move fakes a half-step of
    // centroid motion) and manufactures phantom release velocity. The span
    // trail is the release gate's evidence of the gesture's character.
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
      const pointer = pointers.get(panId);
      if (pointer && dirty) flushPanTo(pointer.x, pointer.y);
      frame = requestAnimationFrame(tick);
    } else if (mode === 'pinch') {
      const [first, second] = touches();
      if (first && second && dirty) flushPinch(first.x, first.y, second.x, second.y);
      frame = requestAnimationFrame(tick);
    }
  };
  const ensureFrames = () => {
    if (!frame) frame = requestAnimationFrame(tick);
  };

  const enterPinch = () => {
    const [first, second] = touches();
    if (!first || !second) return;
    mode = 'pinch';
    lastApplied = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
    lastSpan = Math.hypot(first.x - second.x, first.y - second.y);
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
  const onDown = (event: PointerEvent) => {
    const kind = (event.pointerType || 'mouse') as StagePointerKind;
    if (kind === 'touch') lastTouchAt = performance.now();
    if (kind !== 'touch') {
      if (kind === 'mouse' && event.button !== 0) return;
      if (mode !== 'idle') return; // an active gesture owns the surface
      pointers.set(event.pointerId, {
        id: event.pointerId,
        kind,
        x: event.clientX,
        y: event.clientY,
        downX: event.clientX,
        downY: event.clientY,
      });
      if (sink) {
        // tool-first, exactly the pre-existing hub behavior
        mode = 'tool';
        sink.down(event, clickCount(event));
      } else {
        mode = 'mousedrag';
        begin();
        panId = event.pointerId;
        lastApplied = { x: event.clientX, y: event.clientY };
        ensureFrames();
      }
      return;
    }

    // touch
    switch (mode) {
      case 'idle': {
        pointers.set(event.pointerId, {
          id: event.pointerId,
          kind,
          x: event.clientX,
          y: event.clientY,
          downX: event.clientX,
          downY: event.clientY,
        });
        // Consent pre-flight — but a moving camera always catches first: while
        // content flies under the finger, the touch means "stop", never "grab
        // whatever happens to pass beneath it".
        const moving = host.isMoving();
        if (!moving && sink?.claimsPoint?.(event)) {
          // A tool owns this contact from the first pixel (selected-annotation
          // drag, or an armed drawing tool). No camera transaction — this is
          // not a navigation gesture; a second finger converts it to a pinch
          // via the 'tool' branch (sink.cancel), exactly like a long-press.
          mode = 'tool';
          touchToolGesture = true;
          sink.down(event, 1);
          break;
        }
        mode = 'pending';
        downEvent = event;
        suppressTap = moving; // a catch, not a tap
        begin(true); // stops any fling/tween under the finger
        trail = [];
        pushSample(event.clientX, event.clientY);
        clearLongPress();
        if (sink && !suppressTap) longPressTimer = setTimeout(onLongPress, LONG_PRESS_MS);
        break;
      }
      case 'pending':
      case 'pan': {
        pointers.set(event.pointerId, {
          id: event.pointerId,
          kind,
          x: event.clientX,
          y: event.clientY,
          downX: event.clientX,
          downY: event.clientY,
        });
        clearLongPress();
        enterPinch();
        break;
      }
      case 'tool': {
        // A second finger during a touch tool gesture cancels it into a pinch
        // (the platform convention). Mouse tool gestures ignore stray touches.
        if (!touchToolGesture) return;
        sink?.cancel(event);
        touchToolGesture = false;
        pointers.set(event.pointerId, {
          id: event.pointerId,
          kind,
          x: event.clientX,
          y: event.clientY,
          downX: event.clientX,
          downY: event.clientY,
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

  const onWindowMove = (event: PointerEvent) => {
    const pointer = pointers.get(event.pointerId);
    if (!pointer) return;
    if (pointer.kind === 'touch') lastTouchAt = performance.now();
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    switch (mode) {
      case 'pending': {
        pushSample(pointer.x, pointer.y);
        if (Math.hypot(pointer.x - pointer.downX, pointer.y - pointer.downY) > SLOP) {
          clearLongPress();
          mode = 'pan';
          panId = pointer.id;
          lastApplied = { x: pointer.x, y: pointer.y }; // absorb the slop, like a scroller
          ensureFrames();
        }
        break;
      }
      case 'pan':
        if (pointer.id !== panId) break;
        if (!panArmed) {
          // pinch-leftover contact. Inside the release-grace window the slop
          // base follows the finger — a fast release keeps moving and must
          // never accumulate distance; only a contact that outlives the
          // window can re-earn panning by crossing slop from where it
          // settled.
          const nowT = performance.now();
          if (nowT < panGraceUntil) {
            // a finger that settles (speed drops) inside the window is a
            // continuation taking hold — end the grace early so a deliberate
            // pause-then-drag stays responsive
            const dt = nowT - graceSample.t;
            if (dt >= 8) {
              const speed = Math.hypot(pointer.x - graceSample.x, pointer.y - graceSample.y) / dt;
              graceSample = { t: nowT, x: pointer.x, y: pointer.y };
              if (speed < SETTLE_SPEED) panGraceUntil = 0;
            }
            pointer.downX = pointer.x;
            pointer.downY = pointer.y;
            break;
          }
          if (Math.hypot(pointer.x - pointer.downX, pointer.y - pointer.downY) <= SLOP) break;
          panArmed = true;
          lastApplied = { x: pointer.x, y: pointer.y }; // absorb, like any fresh pan
          trail = [];
          spanTrail = [];
        }
        pushSample(pointer.x, pointer.y);
        dirty = true;
        break;
      case 'pinch':
        // centroid samples are taken per applied frame (see flushPinch) —
        // per-event sampling here would zig-zag between the two fingers
        dirty = true;
        break;
      case 'tool':
        sink?.move(event);
        break;
      case 'mousedrag':
        if (pointer.id === panId) dirty = true;
        break;
      case 'idle':
        break;
    }
  };

  // Hover (cursor feedback) — only with no gesture in flight, and only from
  // the element itself, matching the previous adapters.
  const onHoverMove = (event: PointerEvent) => {
    if (mode === 'idle' && sink) sink.hover(event);
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

  const onUp = (event: PointerEvent) => {
    const pointer = pointers.get(event.pointerId);
    if (!pointer) return;
    if (pointer.kind === 'touch') lastTouchAt = performance.now();
    pointers.delete(event.pointerId);
    switch (mode) {
      case 'pending': {
        // Slop never exceeded, timer never fired: a tap (or a catch).
        clearLongPress();
        end();
        const now = performance.now();
        const isDouble =
          now - lastTapT <= DOUBLE_TAP_MS &&
          Math.hypot(event.clientX - lastTapX, event.clientY - lastTapY) <= DOUBLE_TAP_RADIUS;
        if (suppressTap) {
          lastTapT = 0; // a catch never counts toward a double-tap
        } else if (zoomGestures && isDouble) {
          lastTapT = 0;
          host.doubleTapZoom(vpt(event.clientX, event.clientY));
        } else {
          lastTapT = now;
          lastTapX = event.clientX;
          lastTapY = event.clientY;
          if (sink && downEvent) {
            // The whole click, delivered at release — tools see exactly the
            // down/up pair they would from a mouse.
            sink.down(downEvent, 1);
            sink.up(event);
          }
        }
        toIdle();
        break;
      }
      case 'pan': {
        if (!panArmed) {
          // The pinch's other finger leaving: the gesture ends as a pinch.
          // No flush (release-rolls are noise). Glide is character-gated: a
          // human fast release moves the true centroid (the lifting finger
          // flicks away), so centroid velocity alone lies — the glide fires
          // only when the centroid rate dominates the span rate (a
          // two-finger pan), never on a zoom-dominant release.
          const now = performance.now();
          const velocity = computeReleaseVelocity(trail, now);
          const vs = computeReleaseVelocity(spanTrail, now);
          end(); // close the bracket first — endGesture owns the elastic settle
          if (velocity) {
            const speed = Math.hypot(velocity.vx, velocity.vy);
            if (speed >= FLING_MIN && speed > Math.abs(vs?.vx ?? 0))
              host.fling(velocity.vx, velocity.vy);
          }
          toIdle();
          break;
        }
        flushPanTo(event.clientX, event.clientY); // apply the final sub-frame of travel
        pushSample(event.clientX, event.clientY);
        end();
        maybeFling();
        toIdle();
        break;
      }
      case 'pinch': {
        const rest = touches();
        if (rest.length === 1) {
          // The pinch ends at its last coherent frame. No flush here: the
          // lifting finger's release position is fresh but the other one's is
          // stale (its move for this window may not have arrived), and a
          // centroid of two instants is fiction — in a fast pinch that skewed
          // write was the visible end-of-pinch hop, and its poisoned trail
          // sample the phantom fling. Only coherent finger-pairs write the
          // camera; the sub-frame remainder is discarded, as the platform
          // recognizers do. The remaining contact gets a disarmed pan with
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
        sink?.up(event);
        toIdle();
        break;
      }
      case 'mousedrag': {
        if (pointer.id !== panId) break;
        flushPanTo(event.clientX, event.clientY);
        end();
        toIdle();
        break;
      }
      case 'idle':
        break;
    }
  };

  const onCancel = (event: PointerEvent) => {
    const pointer = pointers.get(event.pointerId);
    if (!pointer) return;
    pointers.delete(event.pointerId);
    if (mode === 'tool') {
      sink?.cancel(event);
      toIdle();
      return;
    }
    if (mode === 'pinch' && backToSingleFinger()) return;
    end();
    toIdle();
  };

  // Wheel is ambient navigation in both modes: ctrl/meta zooms (classified per
  // input by the injected wheelZoomFactor), else scrolls. With zoom gestures
  // off, a zoom-wheel falls through to ordinary pan.
  const onWheel = (event: WheelEvent) => {
    event.preventDefault();
    if (zoomGestures && (event.ctrlKey || event.metaKey)) {
      host.zoomAround(vpt(event.clientX, event.clientY), wheelZoom(event));
    } else {
      const dx = event.shiftKey ? event.deltaY : event.deltaX;
      const dy = event.shiftKey ? event.deltaX : event.deltaY;
      host.panBy(-dx, -dy);
    }
  };

  // Safari's proprietary gesture events. On desktop Safari they are the only
  // trace of a trackpad pinch — convert the absolute scale to per-event ratios.
  // On iOS they fire alongside per-finger pointer events; there the pointer
  // path owns the pinch and these are preventDefault-ed only (a pinch over the
  // stage must never page-zoom Safari). The guard is live touch contacts.
  let lastScale = 1;
  const onGestureStart = (event: Event) => {
    event.preventDefault();
    lastScale = (event as unknown as { scale?: number }).scale ?? 1;
  };
  const onGestureChange = (event: Event) => {
    event.preventDefault();
    // iOS: the pointer path owns touch pinches — and a trailing gesturechange
    // can arrive after the last pointerup, so suppression keys on recent
    // touch activity, not just live contacts. Desktop trackpads have none.
    if (touches().length > 0 || performance.now() - lastTouchAt < 500) return;
    const gesture = event as unknown as { scale?: number; clientX: number; clientY: number };
    const scale = gesture.scale ?? 1;
    if (zoomGestures && scale > 0) {
      host.zoomAround(vpt(gesture.clientX, gesture.clientY), scale / lastScale);
    }
    lastScale = scale;
  };

  element.addEventListener('pointerdown', onDown);
  element.addEventListener('pointermove', onHoverMove);
  window.addEventListener('pointermove', onWindowMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onCancel);
  element.addEventListener('wheel', onWheel, { passive: false });
  const hasGestureEvents = 'GestureEvent' in window;
  if (hasGestureEvents) {
    element.addEventListener('gesturestart', onGestureStart);
    element.addEventListener('gesturechange', onGestureChange);
    element.addEventListener('gestureend', onGestureStart); // reset the base
  }

  return () => {
    element.removeEventListener('pointerdown', onDown);
    element.removeEventListener('pointermove', onHoverMove);
    window.removeEventListener('pointermove', onWindowMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onCancel);
    element.removeEventListener('wheel', onWheel);
    if (hasGestureEvents) {
      element.removeEventListener('gesturestart', onGestureStart);
      element.removeEventListener('gesturechange', onGestureChange);
      element.removeEventListener('gestureend', onGestureStart);
    }
    clearLongPress();
    stopFrames();
    end(); // balance an open transaction on unmount
  };
}
