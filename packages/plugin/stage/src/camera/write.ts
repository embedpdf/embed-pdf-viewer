/**
 * The camera write path: the one low-level clamped write (`writeCamera`), the
 * elastic unclamped write and its rubber-band curves, the rest detector that
 * gates device snapping, the gesture bracket state, and cursor reconciliation
 * from the camera (manipulation only; navigation sets the cursor as intent).
 */
import {
  clampCamera,
  anchorFromCamera,
  travelRange,
  type Camera,
  type Rect,
} from '@embedpdf/core-stage';
import type { PluginContext } from '@embedpdf/core';

import { setCamera, setCameraResting, setCursor, setMotionCause, type StageState } from '../model';
import { rubberIn, rubberOut } from '../motion';
import type { StageServices } from '../services';

/** How long the zoom must hold still before the camera counts as resting. */
const REST_MS = 150;

export function createCameraWrite(
  ctx: PluginContext<StageState>,
  { scheduler, placement, scene }: Pick<StageServices, 'scheduler' | 'placement' | 'scene'>,
) {
  const { canAnimate, scheduler: frames } = scheduler;
  const { camera, viewport, paged, buildScene, stayBounds, constraint } = scene;

  // ── the gesture bracket (touch pan and pinch) ──
  // While open, zoomAround defers its zoom-intent patch and the rest
  // countdown is held: a hesitation inside a pinch is not "at rest". Depth-
  // counted so nested brackets compose. An elastic gesture may also hold the
  // camera past the clamp (rubber-band); `raw` is its unclamped,
  // finger-integrated camera, which the resistance curve maps to what renders.
  const gesture = { depth: 0, zoomed: false, elastic: false, raw: null as Camera | null };

  // ── the camera-rest detector ──
  // Origin snapping is gated on rest (see `StageState.cameraResting`): pages
  // place fractionally while the zoom moves and snap once it settles. The
  // window is counted in scheduler frames, the same timing seam the tween
  // uses, so tests stay deterministic.
  let restFrame = 0;
  const armRest = () => {
    // Initial placement snaps immediately (the first paint is crisp), and a
    // host without real frames keeps snapping always on: rest-gating refines
    // live gestures and is not part of the contract.
    if (!canAnimate || !placement.started) return;
    ctx.state.update(setCameraResting, false);
    if (restFrame) frames.caf(restFrame);
    let startedAt = 0;
    const tick = (timestamp: number) => {
      restFrame = 0;
      if (!startedAt) startedAt = timestamp;
      if (timestamp - startedAt >= REST_MS) {
        ctx.state.update(setCameraResting, true);
        return;
      }
      restFrame = frames.raf(tick);
    };
    restFrame = frames.raf(tick);
  };

  // The one low-level camera write: clamp to `bounds` and store. It never
  // touches the cursor (see syncCursorFromCamera for that policy).
  const writeCamera = (next: Camera, bounds: Rect = stayBounds()) => {
    const clamped = clampCamera(next, bounds, viewport(), constraint());
    if (clamped.zoom !== camera().zoom) {
      if (gesture.depth > 0) {
        // Mid-gesture: un-rest at once (fractional placement) but hold the
        // countdown; rest is declared at endGesture, not at a pinch hesitation.
        gesture.zoomed = true;
        ctx.state.update(setCameraResting, false);
        if (restFrame) {
          frames.caf(restFrame);
          restFrame = 0;
        }
      } else {
        armRest();
      }
    }
    ctx.state.update(setCamera, clamped);
  };

  // ── rubber-band (elastic overscroll) ──
  // The curve pair lives in motion.ts; these adapt it to camera state. The
  // rubber softens only the edges of a scroll range: an axis whose content
  // fits the viewport has no travel, the clamp holds it at its fitAlign rest,
  // and it stays rigid however hard the finger tugs (the UIScrollView
  // default: bouncing exists only where content exceeds the bounds).
  const axisTravels = (origin: number, content: number, view: number, zoom: number): boolean =>
    !travelRange(origin, content, view, zoom, constraint().padding).fits;
  /** The unclamped finger-integrated camera → the displayed camera: clamp,
   *  then re-apply the overshoot through the resistance curve, per travelling
   *  axis. Inside the bounds this is exactly the clamp, and on a fitting axis
   *  it is always the clamp. */
  const rubberize = (raw: Camera): Camera => {
    const clamped = clampCamera(raw, stayBounds(), viewport(), constraint());
    const size = viewport();
    const bounds = stayBounds();
    const axis = (
      rawPosition: number,
      clampedPosition: number,
      dimension: number,
      travels: boolean,
    ): number => {
      if (!travels) return clampedPosition;
      const overshootWorld = rawPosition - clampedPosition;
      if (overshootWorld === 0) return clampedPosition;
      const stretch = rubberOut(Math.abs(overshootWorld) * raw.zoom, Math.max(1, dimension));
      return clampedPosition + (Math.sign(overshootWorld) * stretch) / raw.zoom;
    };
    return {
      zoom: raw.zoom,
      x: axis(
        raw.x,
        clamped.x,
        size.width,
        axisTravels(bounds.x, bounds.width, size.width, raw.zoom),
      ),
      y: axis(
        raw.y,
        clamped.y,
        size.height,
        axisTravels(bounds.y, bounds.height, size.height, raw.zoom),
      ),
    };
  };
  /** The displayed camera → the raw position `rubberize` would have produced
   *  it from. The overshoot is capped just under the asymptote so the inverse
   *  stays finite whatever state a catch finds the camera in. */
  const unrubberize = (displayed: Camera): Camera => {
    const clamped = clampCamera(displayed, stayBounds(), viewport(), constraint());
    const size = viewport();
    const bounds = stayBounds();
    const axis = (
      displayedPosition: number,
      clampedPosition: number,
      dimension: number,
      travels: boolean,
    ): number => {
      if (!travels) return clampedPosition;
      const overshootWorld = displayedPosition - clampedPosition;
      if (overshootWorld === 0) return clampedPosition;
      const span = Math.max(1, dimension);
      const stretch = Math.min(Math.abs(overshootWorld) * displayed.zoom, span - 1);
      return (
        clampedPosition + (Math.sign(overshootWorld) * rubberIn(stretch, span)) / displayed.zoom
      );
    };
    return {
      zoom: displayed.zoom,
      x: axis(
        displayed.x,
        clamped.x,
        size.width,
        axisTravels(bounds.x, bounds.width, size.width, displayed.zoom),
      ),
      y: axis(
        displayed.y,
        clamped.y,
        size.height,
        axisTravels(bounds.y, bounds.height, size.height, displayed.zoom),
      ),
    };
  };
  // The elastic write path, with no clamp: used only by the elastic pan and
  // the edge spring, whose math guarantees every trajectory ends clamped.
  const writeCameraUnclamped = (next: Camera) => ctx.state.update(setCamera, next);

  /**
   * Cursor reconciliation, one direction per interaction:
   *   navigation   → the cursor is intent, set explicitly; the camera honors
   *                  it as far as the clamp allows, and a clamped camera
   *                  never revokes it.
   *   manipulation → (pan, drag, pinch) the camera moves freely and the
   *                  cursor is derived from it. Only those verbs call this.
   * Paged flow never syncs.
   */
  const syncCursorFromCamera = () => {
    if (paged()) return;
    const scene = buildScene();
    if (!scene.itemCount) return;
    ctx.state.update(setCursor, anchorFromCamera(camera(), scene, viewport()).pageIndex);
  };

  /** Tag what drives the next camera or cursor change (see `StageState.motionCause`). */
  const markCause = (cause: StageState['motionCause']): void =>
    ctx.state.update(setMotionCause, cause);

  return {
    gesture,
    armRest,
    writeCamera,
    writeCameraUnclamped,
    axisTravels,
    rubberize,
    unrubberize,
    syncCursorFromCamera,
    markCause,
  };
}
export type StageCameraWrite = ReturnType<typeof createCameraWrite>;
