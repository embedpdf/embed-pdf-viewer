/**
 * Camera motion over the scheduler seam: the coordinate tween, the
 * zoom-anchored tween (it animates the invariant, so the focal page-point
 * holds still by construction), and the momentum and edge physics (glide,
 * spring). One frame handle is shared: `cancelAnimation`, every verb's first
 * act, is also "catch".
 */
import {
  cameraForAnchorAtScreen,
  clampCamera,
  type Anchor,
  type Camera,
  type Point,
  type Rect,
} from '@embedpdf/core-stage';

import type { StageHostCapability } from '../host-contract';
import { easeOutCubic, FLING_STOP, glideStep, springStep, zoomLerp } from '../motion';
import type { StageServices } from '../services';
import type { StageCameraWrite } from './write';

/** The default tween duration. */
const TWEEN_MS = 240;

const lerp = (from: number, to: number, progress: number) => from + (to - from) * progress;

export function createAnimation(
  { events, scheduler, scene }: Pick<StageServices, 'events' | 'scheduler' | 'scene'>,
  write: StageCameraWrite,
) {
  const { motionEnded } = events;
  const { canAnimate, scheduler: frames } = scheduler;
  const { camera, viewport, buildScene, stayBounds, constraint } = scene;
  const { writeCamera, writeCameraUnclamped, axisTravels, syncCursorFromCamera } = write;

  let frame = 0;
  const cancelAnimation = () => {
    if (frame) {
      frames.caf(frame);
      frame = 0;
    }
  };
  /** A tween or fling reached its natural end. */
  const endMotion = () => {
    frame = 0;
    motionEnded.emit({ camera: camera() });
  };

  // The tween clamps to an explicit bounds rect every frame (never a
  // re-derived current item), so animating toward a different item is not
  // clamped back. `then` runs on natural completion only: a cancelled tween
  // belongs to the verb that cancelled it.
  const animateTo = (target: Camera, bounds: Rect, durationMs = TWEEN_MS, then?: () => void) => {
    if (!canAnimate) {
      writeCamera(target, bounds);
      then?.();
      return;
    }
    cancelAnimation();
    const from = camera();
    let started = false;
    let startedAt = 0;
    const tick = (now: number) => {
      if (!started) {
        started = true;
        startedAt = now; // anchor to the first real timestamp (works even when now === 0)
      }
      const progress = easeOutCubic(Math.min(1, (now - startedAt) / durationMs));
      writeCamera(
        {
          x: lerp(from.x, target.x, progress),
          y: lerp(from.y, target.y, progress),
          zoom: lerp(from.zoom, target.zoom, progress),
        },
        bounds,
      );
      if (progress < 1) {
        frame = frames.raf(tick);
      } else {
        endMotion();
        then?.();
      }
    };
    frame = frames.raf(tick);
  };

  /**
   * The zoom-anchored tween animates the invariant, not the coordinates: the
   * focal page-point stays at `point` while the scale changes. Lerping x, y
   * and zoom independently breaks that mid-flight, because holding a screen
   * point requires `x(t) = focal.x − point.x / zoom(t)`, hyperbolic in the
   * zoom, so linear coordinates swing the tapped point along a curve (a
   * visible dip). Here the zoom interpolates geometrically (zoom is
   * multiplicative) and each frame's camera derives from the anchor at that
   * zoom, then clamps: the focal point is stationary by construction, and a
   * zoom-out rails into its fit as the shrinking travel range lets the clamp
   * take over.
   */
  const animateZoomAnchored = (
    focal: Anchor,
    point: Point,
    targetZoom: number,
    durationMs = TWEEN_MS,
    then?: () => void,
  ) => {
    if (!canAnimate) {
      const scene = buildScene();
      if (scene.itemCount) writeCamera(cameraForAnchorAtScreen(focal, scene, point, targetZoom));
      then?.();
      return;
    }
    cancelAnimation();
    const startZoom = camera().zoom;
    let started = false;
    let startedAt = 0;
    const tick = (now: number) => {
      if (!started) {
        started = true;
        startedAt = now;
      }
      const progress = easeOutCubic(Math.min(1, (now - startedAt) / durationMs));
      const zoom = zoomLerp(startZoom, targetZoom, progress);
      const scene = buildScene();
      if (scene.itemCount) writeCamera(cameraForAnchorAtScreen(focal, scene, point, zoom));
      if (progress < 1) {
        frame = frames.raf(tick);
      } else {
        endMotion();
        then?.();
      }
    };
    frame = frames.raf(tick);
  };

  // Momentum and edge physics, the driver over motion.ts's per-axis laws:
  //   glide  — the touch fling, decaying on UIScrollView's curve across free
  //            travel;
  //   spring — a critically-damped return to the clamp, entered when a glide
  //            reaches a content edge (the remaining velocity becomes the
  //            bounce) or when the motion starts displaced (released while
  //            stretched).
  // Axes are independent (a diagonal fling can bounce off the bottom while
  // still gliding horizontally), and every trajectory ends on the clamp. It
  // shares the tween's frame handle, so cancelAnimation() is also "catch":
  // catching mid-bounce holds the stretch.
  const startCameraPhysics = (fingerVelocityX: number, fingerVelocityY: number) => {
    if (!canAnimate) {
      writeCamera(camera()); // no host frames: snap straight into bounds
      return;
    }
    cancelAnimation();
    const zoom = camera().zoom;
    // Per-axis state in screen px (the camera moves opposite the finger;
    // positions scale by zoom once, here, so the laws read in px).
    interface AxisState {
      position: number;
      velocity: number;
      springing: boolean;
      done: boolean;
    }
    const start = camera();
    const startClamped = clampCamera(start, stayBounds(), viewport(), constraint());
    const startBounds = stayBounds();
    const startViewport = viewport();
    const axisState = (
      cameraPosition: number,
      clampedPosition: number,
      fingerVelocity: number,
    ): AxisState => ({
      position: cameraPosition * zoom,
      velocity: -fingerVelocity / 1000,
      springing: cameraPosition !== clampedPosition,
      done: false,
    });
    // A fitting axis takes no ballistic motion: no travel to glide across and
    // no bounce (rigid, like the platform), so its release velocity is
    // discarded. The spring stays armed for a displaced fitting axis.
    const axisX = axisState(
      start.x,
      startClamped.x,
      axisTravels(startBounds.x, startBounds.width, startViewport.width, zoom)
        ? fingerVelocityX
        : 0,
    );
    const axisY = axisState(
      start.y,
      startClamped.y,
      axisTravels(startBounds.y, startBounds.height, startViewport.height, zoom)
        ? fingerVelocityY
        : 0,
    );
    if (
      !axisX.springing &&
      !axisY.springing &&
      Math.hypot(axisX.velocity, axisY.velocity) < FLING_STOP
    ) {
      return;
    }
    let started = false;
    let lastFrameAt = 0;
    const tick = (now: number) => {
      frame = 0;
      // The first frame assumes one 60 Hz step (anchored like the tween, so a
      // first timestamp of 0 works).
      const elapsedMs = started ? Math.min(64, Math.max(1, now - lastFrameAt)) : 16;
      started = true;
      lastFrameAt = now;
      // The clamp of the current position is each axis's home this frame: the
      // edge for a stretched axis, the rest point for a fitting one.
      const home = clampCamera(
        { x: axisX.position / zoom, y: axisY.position / zoom, zoom },
        stayBounds(),
        viewport(),
        constraint(),
      );
      const step = (axis: AxisState, edgeWorld: number) => {
        if (axis.done) return;
        const next = axis.springing
          ? springStep(axis.position, axis.velocity, edgeWorld * zoom, elapsedMs)
          : glideStep(axis.position, axis.velocity, elapsedMs);
        axis.position = next.position;
        axis.velocity = next.velocity;
        axis.done = next.done;
      };
      step(axisX, home.x);
      step(axisY, home.y);
      // A glide that left the travel range converts to a spring at the edge;
      // the incoming velocity carries in, so the bounce grows out of physics
      // rather than a scripted overshoot.
      const nextHome = clampCamera(
        { x: axisX.position / zoom, y: axisY.position / zoom, zoom },
        stayBounds(),
        viewport(),
        constraint(),
      );
      const convert = (axis: AxisState, clampedPosition: number) => {
        if (!axis.springing && Math.abs(clampedPosition * zoom - axis.position) > 1e-6) {
          axis.position = clampedPosition * zoom;
          axis.springing = true;
          axis.done = false;
        }
      };
      convert(axisX, nextHome.x);
      convert(axisY, nextHome.y);
      writeCameraUnclamped({ x: axisX.position / zoom, y: axisY.position / zoom, zoom });
      syncCursorFromCamera();
      if (axisX.done && axisY.done) {
        writeCamera(camera()); // the exact landing: clamped, snapped, settled
        motionEnded.emit({ camera: camera() });
        return;
      }
      frame = frames.raf(tick);
    };
    frame = frames.raf(tick);
  };

  return {
    cancelAnimation,
    animateTo,
    animateZoomAnchored,
    startCameraPhysics,
    api: {
      fling: (velocityX, velocityY) => startCameraPhysics(velocityX, velocityY),
      isMoving: () => frame !== 0,
      stopMotion: () => {
        if (!frame) return;
        cancelAnimation();
        motionEnded.emit({ camera: camera() });
      },
    } satisfies Partial<StageHostCapability>,
  };
}
export type StageAnimation = ReturnType<typeof createAnimation>;
