/**
 * The zoom tool's drag: a box to zoom into, or a click to zoom one step. The
 * drag is held in page coordinates (see {@link ZoomDrag}); `getZoomBox` hands
 * it to the adapters in viewport px only once it is big enough to be a box,
 * so what shows is what the release does. A box zooms in about one point, so
 * it grows straight out until it fills the view.
 */
import {
  anchorAtPoint,
  clampCamera,
  toScreen,
  ZOOM_MAX,
  ZOOM_MIN,
  type Camera,
} from '@embedpdf/core-stage';
import { memo, type PageRef, type PluginContext } from '@embedpdf/core';
import type { Point, Rect } from '@embedpdf/core-geometry';

import type { StageAnimation } from '../camera/animation';
import type { StageCameraWrite } from '../camera/write';
import type { StageHostCapability } from '../host-contract';
import { patchSettings, setZoomDrag, type StageModel, type ZoomDrag } from '../model';
import type { StageServices } from '../services';

/** A drag shorter than this on both axes, in viewport px, is a click. */
const BOX_THRESHOLD_PX = 4;

const rectBetween = (from: Point, to: Point): Rect => ({
  x: Math.min(from.x, to.x),
  y: Math.min(from.y, to.y),
  width: Math.abs(to.x - from.x),
  height: Math.abs(to.y - from.y),
});

const isBox = (box: Rect): boolean =>
  box.width >= BOX_THRESHOLD_PX || box.height >= BOX_THRESHOLD_PX;

export function createZoomDrag(
  ctx: PluginContext<StageModel>,
  { scene }: Pick<StageServices, 'scene'>,
  {
    writeCamera,
    markCause,
    syncCursorFromCamera,
  }: Pick<StageCameraWrite, 'writeCamera' | 'markCause' | 'syncCursorFromCamera'>,
  {
    cancelAnimation,
    animateZoomAnchored,
  }: Pick<StageAnimation, 'cancelAnimation' | 'animateZoomAnchored'>,
  stage: Pick<
    StageHostCapability,
    | 'getPageAt'
    | 'getPageFrame'
    | 'listVisiblePages'
    | 'viewportToPage'
    | 'pageToWorld'
    | 'zoomIn'
    | 'zoomOut'
  >,
) {
  const state = () => ctx.state.get();

  // A page point → viewport px through the page as it is drawn, device-snapped:
  // the exact inverse of `viewportToPage`, so the box sits under the pointer
  // and its middle lands on the point the user saw there.
  const toViewport = (page: PageRef, point: Point): Point | null => {
    const frame = stage.getPageFrame(page);
    if (!frame) return null;
    const view = frame.transform.pageToView(point);
    return { x: frame.screenX + view.x, y: frame.screenY + view.y };
  };

  /** The drag's corners in viewport px; null when its page is not laid out. */
  const viewportRectOf = (drag: ZoomDrag): Rect | null => {
    const from = toViewport(drag.page, drag.from);
    const to = toViewport(drag.page, drag.to);
    return from && to ? rectBetween(from, to) : null;
  };

  // Memoized on the drag and everything that moves it on screen, so the read
  // is reference-stable for adapter selectors.
  const zoomBox = memo(
    () => {
      scene.buildScene(); // keys the scene cache that `cacheKey` reads
      return [state().zoomDrag, scene.camera(), scene.cacheKey()] as const;
    },
    (drag, _camera, _sceneKey): Rect | null => {
      const box = drag && viewportRectOf(drag);
      return box && isBox(box) ? box : null;
    },
  );

  /** The drag's box in world units, the camera's own space; null when its page is not laid out. */
  const worldRectOf = (drag: ZoomDrag): Rect | null => {
    const from = stage.pageToWorld(drag.page, drag.from);
    const to = stage.pageToWorld(drag.page, drag.to);
    return from && to ? rectBetween(from, to) : null;
  };

  /**
   * Zoom into the box: the zoom that fits it inside the padding, the camera
   * that centers it (clamped, as every camera is), and the one point that is
   * at the same place on screen before and after. A tween that holds that
   * point while the zoom changes is a pure zoom, so the box grows straight
   * out. Moving the camera's corner and its zoom each on their own would
   * swing the content away and back on the way.
   */
  const zoomInto = (drag: ZoomDrag): void => {
    const sized = worldRectOf(drag);
    if (!sized) return;
    const view = scene.viewport();
    const inset = scene.padding();
    const fit = Math.min(
      Math.max(1, view.width - 2 * inset) / sized.width,
      Math.max(1, view.height - 2 * inset) / sized.height,
    );
    if (!Number.isFinite(fit)) return;
    const zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, fit));
    // The level becomes the zoom intent up front, as on a double-tap: a tween
    // caught halfway must not leave a fit mode stored.
    ctx.state.update(patchSettings, { zoom: { level: zoom } });
    // A wrapped grid lays out again at a new zoom: place the box in the scene as it is now.
    const box = worldRectOf(drag) ?? sized;
    const from = scene.camera();
    const target: Camera = clampCamera(
      {
        zoom,
        x: box.x + box.width / 2 - view.width / (2 * zoom),
        y: box.y + box.height / 2 - view.height / (2 * zoom),
      },
      scene.stayBounds(),
      view,
      scene.constraint(),
    );
    markCause('user');
    if (state().scrollBehavior === 'instant' || Math.abs(target.zoom - from.zoom) < 1e-9) {
      writeCamera(target);
      syncCursorFromCamera();
      return;
    }
    // The fixed point w solves (w − from)·from.zoom = (w − target)·target.zoom on each axis.
    const fixedOn = (start: number, end: number) =>
      (end * target.zoom - start * from.zoom) / (target.zoom - from.zoom);
    const fixed = { x: fixedOn(from.x, target.x), y: fixedOn(from.y, target.y) };
    const current = scene.buildScene();
    if (!current.itemCount) return;
    animateZoomAnchored(
      anchorAtPoint(current, fixed),
      toScreen(from, fixed),
      target.zoom,
      undefined,
      syncCursorFromCamera,
    );
  };

  return {
    api: {
      beginZoomDrag: (point) => {
        cancelAnimation(); // the content holds still under the box
        // A press between pages anchors on a visible page: every page shares
        // the scene's plane, so any of them can hold the box.
        const page = stage.getPageAt(point)?.ref ?? stage.listVisiblePages()[0]?.ref;
        const from = page ? stage.viewportToPage(page, point) : null;
        ctx.state.update(setZoomDrag, page && from ? { page, from, to: from } : null);
      },
      moveZoomDrag: (point) => {
        const drag = state().zoomDrag;
        // Off screen, the drag's page can't take the point: the box keeps its last corner.
        const to = drag && stage.viewportToPage(drag.page, point);
        if (drag && to) ctx.state.update(setZoomDrag, { ...drag, to });
      },
      endZoomDrag: (options) => {
        const drag = state().zoomDrag;
        if (!drag) return;
        ctx.state.update(setZoomDrag, null);
        const box = viewportRectOf(drag);
        if (!box) return;
        if (!isBox(box)) {
          const around = { x: box.x, y: box.y };
          if (options?.zoomOut) stage.zoomOut({ around });
          else stage.zoomIn({ around });
          return;
        }
        zoomInto(drag);
      },
      cancelZoomDrag: () => ctx.state.update(setZoomDrag, null),
      getZoomBox: zoomBox,
    } satisfies Partial<StageHostCapability>,
  };
}
