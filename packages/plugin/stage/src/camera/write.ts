/**
 * The camera write path: the ONE low-level clamped write (`setCam`), the
 * elastic (unclamped) write and its rubber-band curves, the rest detector
 * that gates device snapping, the gesture bracket state, and cursor
 * reconciliation from the camera (manipulation only — navigation sets the
 * cursor as intent).
 */
import * as S from '@embedpdf/core-stage';

import { rubberIn, rubberOut } from '../motion';
import type { StageContext, StageServices } from '../services';

export function createCameraWrite(
  ctx: StageContext,
  { scheduler, placement, scene }: Pick<StageServices, 'scheduler' | 'placement' | 'scene'>,
) {
  const { canAnimate, scheduler: frames } = scheduler;
  const { cam, vp, paged, buildScene, stayBounds, constraint } = scene;

  // ── gesture transaction (touch pan/pinch) ─────────────────────────────
  // While open: zoomAround defers its intent PATCH, and the rest countdown is
  // held — a hesitation inside a pinch is not "at rest". Depth-counted so
  // nested brackets compose. An ELASTIC gesture may additionally hold the
  // camera past the clamp (rubber-band); `raw` is its unclamped,
  // finger-integrated camera — the resistance curve maps it to what renders.
  const gesture = { depth: 0, zoomed: false, elastic: false, raw: null as S.Camera | null };

  // ── camera-rest detector ────────────────────────────────────────────────────
  // A continuous zoom and a device-snapped origin cannot coexist without the
  // anchor point jittering (each step rounds differently, ±0.5 device px per
  // axis). So origin snapping is gated on REST: fractional placement while
  // the zoom moves, one snap when it settles — when crispness matters. The
  // window is counted in frames frames (the same timing seam the tween
  // uses), so tests stay deterministic.
  const REST_MS = 150;
  let restRaf = 0;
  const armRest = () => {
    // Initial placement snaps immediately (first paint is crisp), and an
    // environment without real frames keeps snapping always-on — rest-gating
    // is a live-gesture refinement, not a contract.
    if (!canAnimate || !placement.started) return;
    if (ctx.getState().cameraResting) ctx.dispatch({ type: 'CAMERA_REST', resting: false });
    if (restRaf) frames.caf(restRaf);
    let t0 = 0;
    const tick = (ts: number) => {
      restRaf = 0;
      if (!t0) t0 = ts;
      if (ts - t0 >= REST_MS) {
        ctx.dispatch({ type: 'CAMERA_REST', resting: true });
        return;
      }
      restRaf = frames.raf(tick);
    };
    restRaf = frames.raf(tick);
  };

  // The ONE low-level camera write: clamp to `bounds`, dispatch. MECHANISM only —
  // it never touches the cursor (see syncCursorFromCamera for the policy).
  const setCam = (next: S.Camera, bounds: S.Rect = stayBounds()) => {
    const clamped = S.clampCamera(next, bounds, vp(), constraint());
    if (clamped.zoom !== cam().zoom) {
      if (gesture.depth > 0) {
        // Mid-gesture: un-rest immediately (fractional placement) but hold the
        // 150 ms countdown — rest is declared at endGesture, not at a pinch
        // hesitation.
        gesture.zoomed = true;
        if (ctx.getState().cameraResting) ctx.dispatch({ type: 'CAMERA_REST', resting: false });
        if (restRaf) {
          frames.caf(restRaf);
          restRaf = 0;
        }
      } else {
        armRest();
      }
    }
    ctx.dispatch({ type: 'CAMERA', camera: clamped });
  };

  // ── rubber-band (elastic overscroll) ────────────────────────────────────────
  // The curve pair lives in motion.ts; these are its STATE adapters. One rule
  // governs where the rubber exists at all: it softens only the edges of a
  // scroll RANGE. An axis whose content FITS the viewport has no travel — the
  // clamp holds it at its fitAlign rest, and it stays rigid however hard the
  // finger tugs (the UIScrollView default: bouncing exists only where content
  // exceeds bounds).
  const axisTravels = (origin: number, content: number, view: number, zoom: number): boolean =>
    !S.travelRange(origin, content, view, zoom, constraint().padding).fits;
  /** Unclamped finger-integrated camera → the DISPLAYED camera: clamp, then
   *  re-apply the overshoot through the resistance curve, per travelling axis.
   *  Inside the bounds this is exactly the clamp (rubber of zero is zero);
   *  on a fitting axis it is exactly the clamp ALWAYS. */
  const rubberize = (raw: S.Camera): S.Camera => {
    const clamped = S.clampCamera(raw, stayBounds(), vp(), constraint());
    const v = vp();
    const b = stayBounds();
    const axis = (rawA: number, clampedA: number, dim: number, travels: boolean): number => {
      if (!travels) return clampedA;
      const dWorld = rawA - clampedA;
      if (dWorld === 0) return clampedA;
      const out = rubberOut(Math.abs(dWorld) * raw.zoom, Math.max(1, dim));
      return clampedA + (Math.sign(dWorld) * out) / raw.zoom;
    };
    return {
      zoom: raw.zoom,
      x: axis(raw.x, clamped.x, v.width, axisTravels(b.x, b.width, v.width, raw.zoom)),
      y: axis(raw.y, clamped.y, v.height, axisTravels(b.y, b.height, v.height, raw.zoom)),
    };
  };
  /** Displayed camera → the raw position `rubberize` would have produced it
   *  from. Overshoot is capped just under the asymptote so the inverse stays
   *  finite whatever state a catch finds the camera in. */
  const unrubberize = (displayed: S.Camera): S.Camera => {
    const clamped = S.clampCamera(displayed, stayBounds(), vp(), constraint());
    const v = vp();
    const b = stayBounds();
    const axis = (dispA: number, clampedA: number, dim: number, travels: boolean): number => {
      if (!travels) return clampedA;
      const dWorld = dispA - clampedA;
      if (dWorld === 0) return clampedA;
      const d = Math.max(1, dim);
      const out = Math.min(Math.abs(dWorld) * displayed.zoom, d - 1);
      return clampedA + (Math.sign(dWorld) * rubberIn(out, d)) / displayed.zoom;
    };
    return {
      zoom: displayed.zoom,
      x: axis(displayed.x, clamped.x, v.width, axisTravels(b.x, b.width, v.width, displayed.zoom)),
      y: axis(
        displayed.y,
        clamped.y,
        v.height,
        axisTravels(b.y, b.height, v.height, displayed.zoom),
      ),
    };
  };
  // The elastic write path: NO clamp — used only by the elastic pan and the
  // edge spring, whose math guarantees every trajectory terminates clamped.
  const setCamRaw = (c: S.Camera) => ctx.dispatch({ type: 'CAMERA', camera: c });

  /**
   * Cursor reconciliation, one direction per interaction:
   *   navigation  → cursor is INTENT, set explicitly; the camera honors it as far
   *                 as the clamp allows — and a clamped camera never revokes it.
   *   manipulation → (pan / drag / pinch) the camera moves freely; the cursor is
   *                 DERIVED from it. Only those verbs call this. Paged never syncs.
   */
  const syncCursorFromCamera = () => {
    if (paged()) return;
    const sc = buildScene();
    if (!sc.itemCount) return;
    const page = S.anchorFromCamera(cam(), sc, vp()).pageIndex;
    if (page !== ctx.getState().cursor) ctx.dispatch({ type: 'CURSOR', cursor: page });
  };

  /** Tag what drives the NEXT camera/cursor change — dispatched on flips
   *  only, read by the page-state feed (see StageState.motionCause). */
  const markCause = (cause: 'user' | 'programmatic'): void => {
    if (ctx.getState().motionCause !== cause) ctx.dispatch({ type: 'MOTION_CAUSE', cause });
  };

  return {
    gesture,
    armRest,
    setCam,
    setCamRaw,
    axisTravels,
    rubberize,
    unrubberize,
    syncCursorFromCamera,
    markCause,
  };
}
export type StageCameraWrite = ReturnType<typeof createCameraWrite>;
