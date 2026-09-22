/**
 * Anchors and arrivals. The anchor is the durable "what am I looking at":
 * captured before a structural change and re-applied after, one mechanism for
 * layout, spread, zoom, resize and restore. Navigation is canonical:
 * goToPage(N) always ends in the same camera state whatever the zoom or the
 * starting point.
 */
import {
  cameraFromAnchor,
  clampCamera,
  placeCamera,
  resolveZoom,
  type AlignmentValue,
  type Anchor,
  type Camera,
  type Rect,
} from '@embedpdf/core-stage';
import type { PluginContext } from '@embedpdf/core';

import type { GoToOptions } from '../contract';
import type { StageAnimation } from '../camera/animation';
import type { StageCameraWrite } from '../camera/write';
import type { StageHostCapability } from '../host-contract';
import { patchSettings, setCursor, type StageState } from '../model';
import type { StageServices } from '../services';

export function createArrival(
  ctx: PluginContext<StageState>,
  { scene }: Pick<StageServices, 'scene'>,
  { writeCamera, markCause }: Pick<StageCameraWrite, 'writeCamera' | 'markCause'>,
  { cancelAnimation, animateTo }: Pick<StageAnimation, 'cancelAnimation' | 'animateTo'>,
) {
  const {
    camera,
    viewport,
    padding,
    paged,
    isFitAll,
    grouping,
    itemIndexOfPage,
    buildScene,
    sceneRect,
    itemRect,
    pageRectOf,
    cursorItem,
    fits,
    alignPoint,
    fitBox,
    boundsFor,
    constraint,
    indexOfPage,
  } = scene;
  const state = () => ctx.state.get();
  const pageCount = () => ctx.document()?.pageCount ?? 0;

  /**
   * Run a placement whose resolved zoom may change the scene (in wrapped mode
   * zoom is a layout input), until the scene it placed against is the scene
   * that results. Every non-wrapped mode is stable after the first pass, and
   * wrapped fit modes converge on the second (the fit box does not depend on
   * wrapping). Capped at 3 passes for the one circular case (fit-all +
   * wrapped).
   */
  const stabilized = (place: () => void) => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const before = buildScene();
      place();
      if (buildScene() === before) return;
    }
  };

  const applyAnchor = (anchor: Anchor, align?: AlignmentValue) => {
    stabilized(() => {
      const current = buildScene();
      if (!current.itemCount) return;
      const item = current.items[current.itemOfPage(anchor.pageIndex)];
      const zoom = resolveZoom(state().zoom, fitBox(item), viewport(), padding());
      // Resolved against the current viewport: a resize restores the anchor
      // to the new viewport's policy point (start/start keeps the top pinned).
      const at = alignPoint(align ?? state().anchorAlign, viewport());
      writeCamera(cameraFromAnchor(anchor, current, viewport(), zoom, at), boundsFor(item));
    });
  };
  /**
   * Re-apply the view after a structural, zoom or viewport change. Normally
   * anchor-preserving (keep looking at the same spot, held at the invariant
   * point). Under fit-all the subject is the whole scene, so keeping an
   * anchor is meaningless: re-place instead (which also centers the scene
   * when unbounded).
   */
  const reapply = (anchor: Anchor, align?: AlignmentValue) => {
    if (isFitAll()) goToTarget(state().cursor, { behavior: 'instant' });
    else applyAnchor(anchor, align);
  };

  const goToTarget = (pageIndex: number, options?: GoToOptions) => {
    markCause('programmatic');
    cancelAnimation();
    if (pageCount() === 0) return;
    const target = Math.max(0, Math.min(pageIndex, pageCount() - 1));
    ctx.state.update(setCursor, target);

    // The restore path (per-page view memory): the exact viewpoint instead of
    // a fresh placement.
    if (options?.viewpoint) {
      ctx.state.update(patchSettings, { zoom: options.viewpoint.zoom });
      applyAnchor(options.viewpoint.anchor);
      return;
    }

    // Placement against the current scene; null when there is nothing to place.
    const placement = (): { camera: Camera; bounds: Rect } | null => {
      const current = buildScene(); // paged: the (possibly new) slice; continuous: the full scene
      if (!current.itemCount) return null;
      const item = paged() ? current.items[0] : current.items[itemIndexOfPage(target)];
      const zoom = resolveZoom(state().zoom, fitBox(item), viewport(), padding());
      const subject = isFitAll()
        ? sceneRect()
        : fits(itemRect(item), zoom)
          ? itemRect(item)
          : pageRectOf(item, target);
      // The landing policy: a per-call override beats the setting, and 'keep'
      // pins that axis to the current camera.
      const landing = { ...state().arrivalAlign, ...options?.arrivalAlign };
      const placed = placeCamera(
        subject,
        viewport(),
        zoom,
        padding(),
        {
          x: landing.x === 'keep' ? 'start' : landing.x,
          y: landing.y === 'keep' ? 'start' : landing.y,
        },
        state().direction,
      );
      // Arrivals are canonical even on an unbounded stage: the landing clamps
      // within the true bounds regardless (free roam is a manipulation
      // affordance, not an arrival one), so an axis with no freedom collapses
      // to its fitAlign rest and the fit-all scene centers even unbounded.
      const bounds = boundsFor(item);
      const settled = clampCamera(placed, bounds, viewport(), { ...constraint(), bounded: true });
      return {
        camera: {
          zoom,
          x: landing.x === 'keep' ? camera().x : settled.x,
          y: landing.y === 'keep' ? camera().y : settled.y,
        },
        bounds,
      };
    };

    if ((options?.behavior ?? state().scrollBehavior) === 'smooth') {
      const landing = placement();
      if (landing) animateTo(landing.camera, landing.bounds);
    } else {
      // An instant placement converges with the scene (wrapped: zoom is a layout input).
      stabilized(() => {
        const landing = placement();
        if (landing) writeCamera(landing.camera, landing.bounds);
      });
    }
  };

  /** Step by the navigation unit: the item when it fits the viewport, else the page. */
  const step = (direction: 1 | -1, options?: GoToOptions) => {
    const item = cursorItem();
    if (!item) return;
    const { grouping: groups } = grouping();
    if (isFitAll() || fits(itemRect(item), camera().zoom)) {
      const index = Math.max(
        0,
        Math.min(itemIndexOfPage(state().cursor) + direction, groups.length - 1),
      );
      goToTarget(groups[index][0], options);
    } else {
      goToTarget(state().cursor + direction, options);
    }
  };

  // Home is page 0, a fresh arrival at arrivalAlign (the clamp collapses any
  // fitting axis to its fitAlign rest point).
  const resetView = (): void => goToTarget(0, { behavior: 'instant' });

  return {
    stabilized,
    applyAnchor,
    reapply,
    goToTarget,
    resetView,
    api: {
      goToPageIndex: (pageIndex, options) => goToTarget(pageIndex, options),
      goToPage: (page, options) => {
        const index = indexOfPage(page);
        if (index >= 0) goToTarget(index, options);
      },
      goToFirstPage: (options) => goToTarget(0, options),
      goToLastPage: (options) =>
        goToTarget(Math.max(0, (ctx.document()?.pageCount ?? 1) - 1), options),
      canGoNext: () => state().cursor < pageCount() - 1,
      canGoPrevious: () => state().cursor > 0,
      nextPage: (options) => step(1, options),
      previousPage: (options) => step(-1, options),
      resetView,
    } satisfies Partial<StageHostCapability>,
  };
}
export type StageArrival = ReturnType<typeof createArrival>;
