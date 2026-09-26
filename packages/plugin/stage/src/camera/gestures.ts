/**
 * Direct manipulation: set / pan / scroll / pinch-zoom the camera and the
 * gesture bracket. The camera moves freely and the cursor is DERIVED from it
 * (the manipulation direction of cursor reconciliation).
 */
import * as S from '@embedpdf/core-stage';

import type { StageScrollToOptions } from '../contract';
import type { StageHostCapability } from '../host-contract';
import type { StagePageReads } from '../read/pages';
import type { StageContext, StageServices } from '../services';
import type { StageAnimation } from './animation';
import type { StageCameraWrite } from './write';

export function createGestures(
  ctx: StageContext,
  { scene }: Pick<StageServices, 'scene'>,
  write: StageCameraWrite,
  { cancelAnim, animateTo, startCameraPhysics }: StageAnimation,
  { scrollMetricsNow }: Pick<StagePageReads, 'scrollMetricsNow'>,
) {
  const { cam, vp, pad, buildScene, stayBounds, constraint } = scene;
  const {
    gesture,
    armRest,
    setCam,
    setCamRaw,
    rubberize,
    unrubberize,
    syncCursorFromCamera,
    markCause,
  } = write;

  const scrollTo = (opts: StageScrollToOptions): void => {
    markCause('user');
    cancelAnim();
    const sc = buildScene();
    if (!sc.itemCount) return;
    const next = S.cameraFromScroll(cam(), stayBounds(), vp(), pad(), opts);
    if (opts.behavior === 'smooth') {
      animateTo(next, stayBounds(), 240, syncCursorFromCamera);
    } else {
      setCam(next);
      syncCursorFromCamera();
    }
  };

  return {
    api: {
      setCamera: (c) => {
        markCause('user');
        cancelAnim();
        setCam(c);
        syncCursorFromCamera();
      },
      panBy: (dx, dy) => {
        markCause('user');
        cancelAnim();
        if (gesture.depth > 0 && gesture.elastic) {
          // Elastic: integrate the finger on the UNCLAMPED camera and display it
          // through the resistance curve. Initialized from the displayed camera's
          // inverse, so catching a mid-bounce stretch continues seamlessly.
          gesture.raw = S.panByScreen(gesture.raw ?? unrubberize(cam()), dx, dy);
          setCamRaw(rubberize(gesture.raw));
        } else {
          setCam(S.panByScreen(cam(), dx, dy));
        }
        syncCursorFromCamera();
      },
      scrollTo,
      scrollBy: ({ left, top, behavior }) => {
        const m = scrollMetricsNow();
        scrollTo({
          left: left === undefined ? undefined : m.scrollLeft + left,
          top: top === undefined ? undefined : m.scrollTop + top,
          behavior,
        });
      },
      zoomAround: (pt, factor) => {
        cancelAnim();
        const before = buildScene();
        // page-relative focal point: the durable identity of "what's under the cursor"
        const focal = before.itemCount ? S.anchorAtPoint(before, S.toWorld(cam(), pt)) : null;
        setCam(S.zoomAround(cam(), pt, factor));
        // record the resulting fixed level as the zoom intent — focal, so no
        // re-anchor… deferred to endGesture inside a gesture bracket (one PATCH
        // per pinch instead of one per event).
        if (gesture.depth === 0) {
          ctx.dispatch({ type: 'PATCH', patch: { zoom: { level: cam().zoom } } });
        }
        // …UNLESS zoom is a LAYOUT INPUT (wrapped grid) and the scene just re-wrapped
        // underneath the camera. The old world point is stale then — re-pin the SAME
        // page-point under the cursor and clamp against the new geometry. In every
        // non-wrapped mode the scene reference is unchanged and this never runs.
        const after = buildScene();
        if (after !== before && focal && after.itemCount) {
          setCam(S.cameraForAnchorAtScreen(focal, after, pt, cam().zoom));
        }
        // A zoom write mid-elastic-gesture (pinch) re-bases the pan integrator:
        // bounds just changed shape under the stretch, so the displayed camera
        // becomes the new reference and resistance re-accumulates from here.
        if (gesture.depth > 0 && gesture.elastic) gesture.raw = unrubberize(cam());
        syncCursorFromCamera();
      },
      beginGesture: (options) => {
        gesture.depth++;
        if (gesture.depth === 1) {
          cancelAnim(); // catch: the next touch-down stops any tween or fling
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
          // The deferred zoom intent: ONE patch for the whole gesture. (In a
          // wrapped grid this may re-wrap the scene; the next reframe
          // re-anchors through the normal update path.)
          ctx.dispatch({ type: 'PATCH', patch: { zoom: { level: cam().zoom } } });
          armRest(); // the gesture is over — NOW the 150 ms rest countdown runs
        }
        syncCursorFromCamera();
        if (wasElastic) {
          // Released while stretched → spring home. A fling() arriving right
          // after simply re-enters the same physics with the release velocity.
          const c = cam();
          const cl = S.clampCamera(c, stayBounds(), vp(), constraint());
          if (cl.x !== c.x || cl.y !== c.y) startCameraPhysics(0, 0);
        }
      },
    } satisfies Partial<StageHostCapability>,
  };
}
export type StageGestures = ReturnType<typeof createGestures>;
