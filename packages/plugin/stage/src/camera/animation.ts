/**
 * Camera motion over the scheduler seam: the coordinate tween, the
 * zoom-anchored tween (animates the invariant — the focal page-point holds
 * still by construction), and the momentum + edge physics (glide, spring).
 * One `raf` handle: every verb's first act, `cancelAnim`, is also "catch".
 */
import * as S from '@embedpdf/core-stage';

import type { StageHostCapability } from '../host-contract';
import { easeOutCubic, FLING_STOP, glideStep, springStep, zoomLerp } from '../motion';
import type { StageServices } from '../services';
import type { StageCameraWrite } from './write';

export function createAnimation(
  { events, scheduler, scene }: Pick<StageServices, 'events' | 'scheduler' | 'scene'>,
  write: StageCameraWrite,
) {
  const { motionEnded } = events;
  const { canAnimate, scheduler: frames } = scheduler;
  const { cam, vp, buildScene, stayBounds, constraint } = scene;
  const { setCam, setCamRaw, axisTravels, syncCursorFromCamera } = write;

  // ── camera tween (impure shell concern; uses the injected Scheduler) ─────────
  let raf = 0;
  const cancelAnim = () => {
    if (raf) {
      frames.caf(raf);
      raf = 0;
    }
  };
  /** A tween or fling reached its natural end. */
  const endMotion = () => {
    raf = 0;
    motionEnded.emit({ camera: cam() });
  };

  const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
  // The tween clamps to an EXPLICIT bounds rect every frame (never a re-derived
  // current item), so animating toward a different item isn't clamped back.
  // `then` runs on natural completion only — a cancelled tween belongs to the
  // verb that cancelled it.
  const animateTo = (target: S.Camera, bounds: S.Rect, ms = 240, then?: () => void) => {
    if (!canAnimate) {
      setCam(target, bounds);
      then?.();
      return;
    }
    cancelAnim();
    const from = cam();
    let started = false;
    let t0 = 0;
    const tick = (now: number) => {
      if (!started) {
        started = true;
        t0 = now; // anchor to the first real timestamp (works even when now === 0)
      }
      const k = easeOutCubic(Math.min(1, (now - t0) / ms));
      setCam(
        {
          x: lerp(from.x, target.x, k),
          y: lerp(from.y, target.y, k),
          zoom: lerp(from.zoom, target.zoom, k),
        },
        bounds,
      );
      if (k < 1) {
        raf = frames.raf(tick);
      } else {
        endMotion();
        then?.();
      }
    };
    raf = frames.raf(tick);
  };

  /**
   * Zoom-anchored tween — animates THE INVARIANT, not the coordinates. A
   * camera move is defined by what it holds fixed; for an anchored zoom that
   * is "the focal page-point stays at `pt` while scale changes". Lerping
   * x/y/zoom independently (the plain tween) breaks that mid-flight: holding
   * a screen point requires `x(t) = focal.x − pt.x / zoom(t)` — hyperbolic in
   * the zoom — so linear coordinates swing the tapped point along a curved
   * path (the visible "dip"). Here the zoom interpolates GEOMETRICALLY
   * (constant rate — zoom is multiplicative) and each frame's camera derives
   * from the anchor at that zoom, then clamps: the focal point is stationary
   * by construction, and a zoom-out rails into its fit progressively as the
   * shrinking travel range lets the clamp take over.
   */
  const animateZoomAnchored = (
    focal: S.Anchor,
    pt: S.Point,
    targetZoom: number,
    ms = 240,
    then?: () => void,
  ) => {
    if (!canAnimate) {
      const sc = buildScene();
      if (sc.itemCount) setCam(S.cameraForAnchorAtScreen(focal, sc, pt, targetZoom));
      then?.();
      return;
    }
    cancelAnim();
    const z0 = cam().zoom;
    let started = false;
    let t0 = 0;
    const tick = (now: number) => {
      if (!started) {
        started = true;
        t0 = now;
      }
      const k = easeOutCubic(Math.min(1, (now - t0) / ms));
      const z = zoomLerp(z0, targetZoom, k);
      const sc = buildScene();
      if (sc.itemCount) setCam(S.cameraForAnchorAtScreen(focal, sc, pt, z));
      if (k < 1) {
        raf = frames.raf(tick);
      } else {
        endMotion();
        then?.();
      }
    };
    raf = frames.raf(tick);
  };

  // Momentum + edge physics — the driver over motion.ts's per-axis laws:
  //   glide  — the touch fling, decaying on UIScrollView's curve across free
  //            travel;
  //   spring — a critically-damped return to the clamp, entered when a glide
  //            reaches a content edge (remaining velocity becomes the bounce)
  //            or when the motion STARTS displaced (release while stretched).
  // Axes are independent (a diagonal fling can bounce off the bottom while
  // still gliding horizontally). Every trajectory terminates ON the clamp.
  // Shares the `raf` handle with the tween, so cancelAnim() — every verb's
  // first act — is also "catch": catching mid-bounce holds the stretch.
  const startCameraPhysics = (vxFinger: number, vyFinger: number) => {
    if (!canAnimate) {
      setCam(cam()); // no host frames: snap straight into bounds
      return;
    }
    cancelAnim();
    const zoom = cam().zoom;
    // Per-axis state in camera-space SCREEN px (the camera moves OPPOSITE the
    // finger; positions scale by zoom once, here, so the laws read in px).
    interface AxisState {
      p: number;
      v: number;
      springing: boolean;
      done: boolean;
    }
    const c0 = cam();
    const cl0 = S.clampCamera(c0, stayBounds(), vp(), constraint());
    const b0 = stayBounds();
    const v0 = vp();
    const mk = (camA: number, clampedA: number, fingerV: number): AxisState => ({
      p: camA * zoom,
      v: -fingerV / 1000,
      springing: camA !== clampedA,
      done: false,
    });
    // A fitting axis takes no ballistic motion: no travel to glide across and
    // no bounce (rigid, like the platform) — release velocity is discarded.
    // The spring stays armed for a DISPLACED fitting axis (repair to rest).
    const ax = mk(c0.x, cl0.x, axisTravels(b0.x, b0.width, v0.width, zoom) ? vxFinger : 0);
    const ay = mk(c0.y, cl0.y, axisTravels(b0.y, b0.height, v0.height, zoom) ? vyFinger : 0);
    if (!ax.springing && !ay.springing && Math.hypot(ax.v, ay.v) < FLING_STOP) return;
    let started = false;
    let last = 0;
    const tick = (now: number) => {
      raf = 0;
      // First frame assumes one 60Hz step (anchoring like the tween — works
      // even when the first timestamp is 0).
      const dt = started ? Math.min(64, Math.max(1, now - last)) : 16;
      started = true;
      last = now;
      // The clamp of the CURRENT position is each axis's home this frame: for
      // a stretched axis it is the edge; for a fitting axis, its rest point.
      const cl = S.clampCamera(
        { x: ax.p / zoom, y: ay.p / zoom, zoom },
        stayBounds(),
        vp(),
        constraint(),
      );
      const step = (a: AxisState, edgeWorld: number) => {
        if (a.done) return;
        const r = a.springing
          ? springStep(a.p, a.v, edgeWorld * zoom, dt)
          : glideStep(a.p, a.v, dt);
        a.p = r.p;
        a.v = r.v;
        a.done = r.done;
      };
      step(ax, cl.x);
      step(ay, cl.y);
      // A glide that left the travel range converts to a spring AT the edge —
      // the incoming velocity carries in, so the bounce grows out of physics
      // rather than a scripted overshoot.
      const ncl = S.clampCamera(
        { x: ax.p / zoom, y: ay.p / zoom, zoom },
        stayBounds(),
        vp(),
        constraint(),
      );
      const convert = (a: AxisState, clampedA: number) => {
        if (!a.springing && Math.abs(clampedA * zoom - a.p) > 1e-6) {
          a.p = clampedA * zoom;
          a.springing = true;
          a.done = false;
        }
      };
      convert(ax, ncl.x);
      convert(ay, ncl.y);
      setCamRaw({ x: ax.p / zoom, y: ay.p / zoom, zoom });
      syncCursorFromCamera();
      if (ax.done && ay.done) {
        setCam(cam()); // exact landing: clamped, snapped, settled
        motionEnded.emit({ camera: cam() });
        return;
      }
      raf = frames.raf(tick);
    };
    raf = frames.raf(tick);
  };

  return {
    cancelAnim,
    animateTo,
    animateZoomAnchored,
    startCameraPhysics,
    api: {
      fling: (vx, vy) => startCameraPhysics(vx, vy),
      isMoving: () => raf !== 0,
      stopMotion: () => {
        if (!raf) return;
        cancelAnim();
        motionEnded.emit({ camera: cam() });
      },
    } satisfies Partial<StageHostCapability>,
  };
}
export type StageAnimation = ReturnType<typeof createAnimation>;
