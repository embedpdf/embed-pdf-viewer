/**
 * Reveals. A bare reveal is NOT navigation: minimal visibility, cursor
 * untouched (paged flow: revealing a page IS navigating to it). A positioned
 * reveal (rect / anchor / zoom — a search hit, a PDF destination) is an
 * ARRIVAL: the cursor is set up front, the camera lands per the anchor
 * policy, and a resolved zoom becomes the zoom intent.
 */
import * as S from '@embedpdf/core-stage';
import type { PageRef } from '@embedpdf/core';

import type { RevealAnchorValue, RevealOptions } from '../contract';
import type { StageAnimation } from '../camera/animation';
import type { StageCameraWrite } from '../camera/write';
import type { StageHostCapability } from '../host-contract';
import type { StageContext, StageServices } from '../services';
import type { StageArrival } from './arrive';

export function createReveal(
  ctx: StageContext,
  { scene }: Pick<StageServices, 'scene'>,
  { setCam, markCause }: Pick<StageCameraWrite, 'setCam' | 'markCause'>,
  { cancelAnim, animateTo }: Pick<StageAnimation, 'cancelAnim' | 'animateTo'>,
  { stabilized, goToTarget }: Pick<StageArrival, 'stabilized' | 'goToTarget'>,
) {
  const {
    cam,
    vp,
    pad,
    paged,
    itemIndexOfPage,
    worldPageFrame,
    buildScene,
    sceneRect,
    pageRectOf,
    worldRectForContent,
    boundsFor,
    indexOfPage,
  } = scene;

  /**
   * One axis of a positioned-reveal camera. `undefined` = 'nearest' (only
   * move if the target is outside the padded view) — unless the zoom just
   * changed, where "don't move" is meaningless and the spec's slack-axis
   * rule (center) applies. 'keep' never moves the axis (PDF /XYZ null).
   */
  const revealAxis = (
    a: RevealAnchorValue | undefined,
    camPos: number,
    rectPos: number,
    rectExtent: number,
    vpExtent: number,
    zoom: number,
    zoomChanged: boolean,
  ): number => {
    if (a === 'keep') return camPos;
    const p = pad();
    if (a === undefined) {
      if (!zoomChanged) {
        const lo = camPos + p / zoom;
        const hi = camPos + (vpExtent - p) / zoom;
        if (rectPos >= lo && rectPos + rectExtent <= hi) return camPos; // already visible
        if (rectExtent > hi - lo || rectPos < lo) return rectPos - p / zoom;
        return rectPos + rectExtent - (vpExtent - p) / zoom;
      }
      a = 'center';
    }
    if (a === 'start') return rectPos - p / zoom;
    if (a === 'end') return rectPos + rectExtent - (vpExtent - p) / zoom;
    const f = a === 'center' ? 0.5 : Math.min(1, Math.max(0, a));
    return rectPos + rectExtent / 2 - (vpExtent * f) / zoom;
  };

  const revealIndex = (pageIndex: number, opts?: RevealOptions): void => {
    markCause('programmatic');
    const doc = ctx.document();
    if (!doc || doc.pageCount === 0) return;
    const target = Math.max(0, Math.min(pageIndex, doc.pageCount - 1));
    const positioned =
      !!opts &&
      // `rect: null` means "no rect", same as absent — so nullable sources
      // (`CommentThreadView.contentRect`) flow in without a `?? undefined`.
      (opts.rect != null ||
        opts.anchor !== undefined ||
        (opts.zoom !== undefined && opts.zoom !== 'keep'));

    if (!positioned) {
      // Bare reveal — NOT navigation: minimal visibility, cursor untouched.
      if (paged()) {
        // the page isn't in the one-item slice — revealing it IS navigating to it
        goToTarget(target, opts);
        return;
      }
      const sc = buildScene();
      if (!sc.itemCount) return;
      const page = pageRectOf(sc.items[itemIndexOfPage(target)], target);
      // Reveal the OUTER box: pageFrame chrome (labels, buttons) belongs to the
      // page, so "make the page visible" includes its reserved bands.
      const m = worldPageFrame();
      const box = {
        x: page.x - m.left,
        y: page.y - m.top,
        width: page.width + m.left + m.right,
        height: page.height + m.top + m.bottom,
      };
      const camera = S.revealCamera(cam(), box, vp(), pad());
      const current = cam();
      if (camera.x === current.x && camera.y === current.y) return; // already visible
      cancelAnim();
      if ((opts?.behavior ?? ctx.getState().scrollBehavior) === 'smooth') {
        animateTo(camera, sceneRect());
      } else {
        setCam(camera, sceneRect());
      }
      return;
    }

    // Positioned reveal: an ARRIVAL at a rect/point (search hit, PDF
    // destination). Like navigation, the cursor is INTENT — set up front
    // (paged: this also rebuilds the one-item slice), not derived from a
    // possibly mid-tween camera.
    cancelAnim();
    if (target !== ctx.getState().cursor) {
      ctx.dispatch({ type: 'CURSOR', cursor: target });
    }

    const place = (): { camera: S.Camera; bounds: S.Rect; zoomChanged: boolean } | null => {
      const sc = buildScene();
      if (!sc.itemCount) return null;
      const item = paged() ? sc.items[0] : sc.items[itemIndexOfPage(target)];
      const world = opts.rect
        ? worldRectForContent(item, target, opts.rect)
        : pageRectOf(item, target);
      const zd = opts.zoom ?? 'keep';
      const availW = Math.max(1, vp().width - 2 * pad());
      const availH = Math.max(1, vp().height - 2 * pad());
      let zoom =
        typeof zd === 'object'
          ? zd.level
          : zd === 'fit'
            ? Math.min(availW / world.width, availH / world.height)
            : zd === 'fit-width'
              ? availW / world.width
              : zd === 'fit-height'
                ? availH / world.height
                : cam().zoom;
      // Degenerate target (a point with a fit directive) → pan only.
      if (!Number.isFinite(zoom) || zoom <= 0) zoom = cam().zoom;
      const zoomChanged = zd !== 'keep';
      const a = opts.anchor ?? {};
      return {
        camera: {
          x: revealAxis(a.x, cam().x, world.x, world.width, vp().width, zoom, zoomChanged),
          y: revealAxis(a.y, cam().y, world.y, world.height, vp().height, zoom, zoomChanged),
          zoom,
        },
        bounds: boundsFor(item),
        zoomChanged,
      };
    };

    const first = place();
    if (!first) return;
    // A resolved zoom becomes the zoom intent (like zoomAround), so later
    // resizes/refits keep the destination's magnification.
    if (first.zoomChanged) {
      ctx.dispatch({ type: 'PATCH', patch: { zoom: { level: first.camera.zoom } } });
    }
    if ((opts.behavior ?? ctx.getState().scrollBehavior) === 'smooth') {
      // If the zoom patch re-wrapped the scene (zoom is a layout input in
      // wrapped mode), recompute once against the new geometry.
      const p = place() ?? first;
      animateTo(p.camera, p.bounds);
    } else {
      stabilized(() => {
        const p = place();
        if (p) setCam(p.camera, p.bounds);
      });
    }
  };

  const reveal = (page: PageRef, opts?: RevealOptions): void => {
    const index = indexOfPage(page);
    if (index >= 0) revealIndex(index, opts);
  };

  return {
    api: {
      reveal,
      revealRect: (page, rect, opts) => reveal(page, { ...opts, rect }),
      revealIndex,
    } satisfies Partial<StageHostCapability>,
  };
}
