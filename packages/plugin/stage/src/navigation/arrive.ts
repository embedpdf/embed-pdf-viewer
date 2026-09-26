/**
 * Anchors and arrivals. The anchor is the durable "what am I looking at":
 * captured before a structural change, re-applied after — one mechanism for
 * layout/spread/zoom/resize/restore. Navigation is CANONICAL: goToPage(N)
 * always ends in the same camera state whatever the zoom or the origin.
 */
import * as S from '@embedpdf/core-stage';

import type { GoToOptions } from '../contract';
import type { StageAnimation } from '../camera/animation';
import type { StageCameraWrite } from '../camera/write';
import type { StageHostCapability } from '../host-contract';
import type { StageContext, StageServices } from '../services';

export function createArrival(
  ctx: StageContext,
  { scene }: Pick<StageServices, 'scene'>,
  { setCam, markCause }: Pick<StageCameraWrite, 'setCam' | 'markCause'>,
  { cancelAnim, animateTo }: Pick<StageAnimation, 'cancelAnim' | 'animateTo'>,
) {
  const {
    cam,
    vp,
    pad,
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

  /**
   * Run a placement whose RESOLVED zoom may change the scene (wrapped mode: zoom is
   * a layout input). Re-run it until the scene it placed against is the scene that
   * results — every non-wrapped mode is stable after the first pass by construction,
   * and wrapped fit-modes converge on the second (the fit-box is wrap-independent).
   * Capped at 3 passes for the one genuinely circular case (fit-all + wrapped).
   */
  const stabilized = (place: () => void) => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const scene = buildScene();
      place();
      if (buildScene() === scene) return;
    }
  };

  const applyAnchor = (anchor: S.Anchor, align?: S.AlignmentValue) => {
    stabilized(() => {
      const scene = buildScene();
      if (!scene.itemCount) return;
      const item = scene.items[scene.itemOfPage(anchor.pageIndex)];
      const zoom = S.resolveZoom(ctx.getState().zoom, fitBox(item), vp(), pad());
      // resolved against the CURRENT viewport — a resize restores the anchor to
      // the new viewport's policy point (start/start: the top stays pinned)
      const at = alignPoint(align ?? ctx.getState().anchorAlign, vp());
      setCam(S.cameraFromAnchor(anchor, scene, vp(), zoom, at), boundsFor(item));
    });
  };
  /**
   * Re-apply the view after a structural/zoom/viewport change. Normally anchor-
   * preserving (keep looking at the same spot, held at the invariant point).
   * Under fit-all the subject is the WHOLE scene, so "keep my anchor" is
   * meaningless — re-place instead (this is what centers the scene even when
   * unbounded).
   */
  const reapply = (anchor: S.Anchor, align?: S.AlignmentValue) => {
    if (isFitAll()) goToTarget(ctx.getState().cursor, { behavior: 'instant' });
    else applyAnchor(anchor, align);
  };

  const goToTarget = (pageIndex: number, opts?: GoToOptions) => {
    markCause('programmatic');
    cancelAnim();
    const doc = ctx.document();
    if (!doc || doc.pageCount === 0) return;
    const target = Math.max(0, Math.min(pageIndex, doc.pageCount - 1));
    if (target !== ctx.getState().cursor) ctx.dispatch({ type: 'CURSOR', cursor: target });

    // Restore path (per-page view memory): exact viewpoint instead of fresh placement.
    if (opts?.viewpoint) {
      ctx.dispatch({ type: 'PATCH', patch: { zoom: opts.viewpoint.zoom } });
      applyAnchor(opts.viewpoint.anchor);
      return;
    }

    // Placement against the CURRENT scene; null when there is nothing to place.
    const placement = (): { camera: S.Camera; bounds: S.Rect } | null => {
      const sc = buildScene(); // paged: the (possibly new) slice; continuous: full scene
      if (!sc.itemCount) return null;
      const item = paged() ? sc.items[0] : sc.items[itemIndexOfPage(target)];
      const zoom = S.resolveZoom(ctx.getState().zoom, fitBox(item), vp(), pad());
      const subject = isFitAll()
        ? sceneRect()
        : fits(itemRect(item), zoom)
          ? itemRect(item)
          : pageRectOf(item, target);
      // The landing policy: a per-call override beats the setting (explicit
      // beats default); 'keep' pins that axis to the current camera.
      const want = { ...ctx.getState().arrivalAlign, ...opts?.arrivalAlign };
      const placed = S.placeCamera(
        subject,
        vp(),
        zoom,
        pad(),
        {
          x: want.x === 'keep' ? 'start' : want.x,
          y: want.y === 'keep' ? 'start' : want.y,
        },
        ctx.getState().direction,
      );
      // Arrivals are canonical even on an UNBOUNDED stage: the landing clamps
      // within the true bounds regardless (free roam is a manipulation
      // affordance, not an arrival one) — an axis with no freedom collapses to
      // its fitAlign rest here, and the fit-all scene centers even unbounded.
      const bounds = boundsFor(item);
      const settled = S.clampCamera(placed, bounds, vp(), { ...constraint(), bounded: true });
      return {
        camera: {
          zoom,
          x: want.x === 'keep' ? cam().x : settled.x,
          y: want.y === 'keep' ? cam().y : settled.y,
        },
        bounds,
      };
    };

    if ((opts?.behavior ?? ctx.getState().scrollBehavior) === 'smooth') {
      const p = placement();
      if (p) animateTo(p.camera, p.bounds);
    } else {
      // instant placement converges with the scene (wrapped: zoom is a layout input)
      stabilized(() => {
        const p = placement();
        if (p) setCam(p.camera, p.bounds);
      });
    }
  };

  /** Step by the navigation unit: the ITEM when it fits the viewport, else the PAGE. */
  const step = (direction: 1 | -1, opts?: GoToOptions) => {
    const st = ctx.getState();
    const item = cursorItem();
    if (!item) return;
    const { grouping: g } = grouping();
    if (isFitAll() || fits(itemRect(item), cam().zoom)) {
      const idx = Math.max(0, Math.min(itemIndexOfPage(st.cursor) + direction, g.length - 1));
      goToTarget(g[idx][0], opts);
    } else {
      goToTarget(st.cursor + direction, opts);
    }
  };

  // Home = page 0, a fresh arrival at arrivalAlign (the clamp collapses any
  // fitting axis to its fitAlign rest point).
  const resetView = (): void => goToTarget(0, { behavior: 'instant' });

  return {
    stabilized,
    applyAnchor,
    reapply,
    goToTarget,
    resetView,
    api: {
      goToPageIndex: (pageIndex, opts) => goToTarget(pageIndex, opts),
      goToPage: (page, opts) => {
        const index = indexOfPage(page);
        if (index >= 0) goToTarget(index, opts);
      },
      goToFirstPage: (opts) => goToTarget(0, opts),
      goToLastPage: (opts) => goToTarget(Math.max(0, (ctx.document()?.pageCount ?? 1) - 1), opts),
      canGoNext: () => ctx.getState().cursor < (ctx.document()?.pageCount ?? 0) - 1,
      canGoPrevious: () => ctx.getState().cursor > 0,
      nextPage: (opts) => step(1, opts),
      previousPage: (opts) => step(-1, opts),
      resetView,
    } satisfies Partial<StageHostCapability>,
  };
}
export type StageArrival = ReturnType<typeof createArrival>;
