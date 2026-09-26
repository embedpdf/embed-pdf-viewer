/**
 * Direct manipulation: set, pan, scroll and pinch-zoom the camera, and the
 * gesture bracket. The camera moves freely and the cursor is derived from it
 * (the manipulation direction of cursor reconciliation).
 */
import {
  anchorAtPoint,
  cameraForAnchorAtScreen,
  cameraFromScroll,
  clampCamera,
  panByScreen,
  toWorld,
  zoomAround,
} from '@embedpdf/core-stage';
import type { PluginContext } from '@embedpdf/core';

import type { StageScrollToOptions } from '../contract';
import type { StageHostCapability } from '../host-contract';
import { patchSettings, type StageState } from '../model';
import type { StagePageReads } from '../read/pages';
import type { StageServices } from '../services';
import type { StageAnimation } from './animation';
import type { StageCameraWrite } from './write';

export function createGestures(
  ctx: PluginContext<StageState>,
  { scene }: Pick<StageServices, 'scene'>,
  write: StageCameraWrite,
  { cancelAnimation, animateTo, startCameraPhysics }: StageAnimation,
  { scrollMetricsNow }: Pick<StagePageReads, 'scrollMetricsNow'>,
) {
  const { camera, viewport, padding, buildScene, stayBounds, constraint } = scene;
  const {
    gesture,
    armRest,
    writeCamera,
    writeCameraUnclamped,
    rubberize,
    unrubberize,
    syncCursorFromCamera,
    markCause,
  } = write;

  const scrollTo = (options: StageScrollToOptions): void => {
    markCause('user');
    cancelAnimation();
    if (!buildScene().itemCount) return;
    const next = cameraFromScroll(camera(), stayBounds(), viewport(), padding(), options);
    if (options.behavior === 'smooth') {
      animateTo(next, stayBounds(), undefined, syncCursorFromCamera);
    } else {
      writeCamera(next);
      syncCursorFromCamera();
    }
  };

  return {
    api: {
      setCamera: (next) => {
        markCause('user');
        cancelAnimation();
        writeCamera(next);
        syncCursorFromCamera();
      },
      panBy: (dx, dy) => {
        markCause('user');
        cancelAnimation();
        if (gesture.depth > 0 && gesture.elastic) {
          // Elastic: integrate the finger on the unclamped camera and display
          // it through the resistance curve. Initialized from the displayed
          // camera's inverse, so catching a mid-bounce stretch continues
          // seamlessly.
          gesture.raw = panByScreen(gesture.raw ?? unrubberize(camera()), dx, dy);
          writeCameraUnclamped(rubberize(gesture.raw));
        } else {
          writeCamera(panByScreen(camera(), dx, dy));
        }
        syncCursorFromCamera();
      },
      scrollTo,
      scrollBy: ({ left, top, behavior }) => {
        const metrics = scrollMetricsNow();
        scrollTo({
          left: left === undefined ? undefined : metrics.scrollLeft + left,
          top: top === undefined ? undefined : metrics.scrollTop + top,
          behavior,
        });
      },
      zoomAround: (point, factor) => {
        cancelAnimation();
        const before = buildScene();
        // The page-relative focal point: the durable identity of "what is
        // under the pointer".
        const focal = before.itemCount ? anchorAtPoint(before, toWorld(camera(), point)) : null;
        writeCamera(zoomAround(camera(), point, factor));
        // Record the resulting level as the zoom intent (focal, so no
        // re-anchor). Inside a gesture bracket it is deferred to endGesture:
        // one patch per pinch instead of one per event.
        if (gesture.depth === 0) {
          ctx.state.update(patchSettings, { zoom: { level: camera().zoom } });
        }
        // When zoom is a layout input (a wrapped grid) the scene may just have
        // re-wrapped under the camera, leaving the old world point stale:
        // re-pin the same page-point under the pointer and clamp against the
        // new geometry. In every other mode the scene is unchanged and this
        // never runs.
        const after = buildScene();
        if (after !== before && focal && after.itemCount) {
          writeCamera(cameraForAnchorAtScreen(focal, after, point, camera().zoom));
        }
        // A zoom write in an elastic gesture (a pinch) re-bases the pan
        // integrator: the bounds just changed shape under the stretch, so
        // the displayed camera becomes the new reference.
        if (gesture.depth > 0 && gesture.elastic) gesture.raw = unrubberize(camera());
        syncCursorFromCamera();
      },
      beginGesture: (options) => {
        gesture.depth++;
        if (gesture.depth === 1) {
          cancelAnimation(); // catch: the next touch-down stops any tween or fling
          gesture.zoomed = false;
          gesture.elastic = options?.elastic === true;
          gesture.raw = null;
        }
      },
      endGesture: () => {
        if (gesture.depth === 0) return;
        gesture.depth--;
        if (gesture.depth > 0) return;
        gesture.raw = null;
        const wasElastic = gesture.elastic;
        gesture.elastic = false;
        if (gesture.zoomed) {
          gesture.zoomed = false;
          // The deferred zoom intent: one patch for the whole gesture. (In a
          // wrapped grid this may re-wrap the scene; the next reframe
          // re-anchors through the normal update path.)
          ctx.state.update(patchSettings, { zoom: { level: camera().zoom } });
          armRest(); // the gesture is over: the rest countdown runs now
        }
        syncCursorFromCamera();
        if (wasElastic) {
          // Released while stretched: spring home. A fling() right after
          // re-enters the same physics with the release velocity.
          const current = camera();
          const clamped = clampCamera(current, stayBounds(), viewport(), constraint());
          if (clamped.x !== current.x || clamped.y !== current.y) startCameraPhysics(0, 0);
        }
      },
    } satisfies Partial<StageHostCapability>,
  };
}
export type StageGestures = ReturnType<typeof createGestures>;
