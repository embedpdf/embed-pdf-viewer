/**
 * Reveals and destinations. A bare reveal is not navigation: minimal
 * visibility, cursor untouched (in paged flow, revealing a page is navigating
 * to it). A positioned reveal (rect, align or zoom: a search hit) is an
 * arrival: the cursor is set up front, the camera lands per the alignment
 * policy, and a resolved zoom becomes the zoom intent. A destination is a
 * positioned reveal of the spot it names.
 */
import { clampZoom, revealCamera, type Camera, type Rect as StageRect } from '@embedpdf/core-stage';
import type { PageDestination, PluginContext, PageRef } from '@embedpdf/core';

import type { GoToDestinationOptions, ArrivalAlignValue, RevealOptions } from '../contract';
import { revealOfDestination } from '../destination';
import type { StageAnimation } from '../camera/animation';
import type { StageCameraWrite } from '../camera/write';
import type { StageHostCapability } from '../host-contract';
import { patchSettings, setCursor, type StageModel } from '../model';
import type { StageServices } from '../services';
import { whenPlaced } from '../services/placement-latch';
import type { StageArrival } from './arrive';

export function createReveal(
  ctx: PluginContext<StageModel>,
  { scene, placement }: Pick<StageServices, 'scene' | 'placement'>,
  { writeCamera, markCause }: Pick<StageCameraWrite, 'writeCamera' | 'markCause'>,
  { cancelAnimation, animateTo }: Pick<StageAnimation, 'cancelAnimation' | 'animateTo'>,
  { stabilized, goToTarget }: Pick<StageArrival, 'stabilized' | 'goToTarget'>,
) {
  const {
    camera,
    viewport,
    padding,
    zoomLimits,
    paged,
    itemIndexOfPage,
    worldPageFrame,
    buildScene,
    sceneRect,
    pageRectOf,
    worldRectForContent,
    boundsFor,
    indexOfTarget,
  } = scene;
  const state = () => ctx.state.get();

  /**
   * One axis of a positioned-reveal camera. `undefined` is 'nearest' (move
   * only when the target is outside the padded view), unless the zoom just
   * changed: then "do not move" is meaningless and the slack-axis rule
   * (center) applies. 'keep' never moves the axis (PDF /XYZ null).
   */
  const revealAxis = (
    align: ArrivalAlignValue | undefined,
    cameraPosition: number,
    rectPosition: number,
    rectExtent: number,
    viewportExtent: number,
    zoom: number,
    zoomChanged: boolean,
    before: number,
    after: number,
  ): number => {
    if (align === 'keep') return cameraPosition;
    if (align === undefined) {
      if (!zoomChanged) {
        const low = cameraPosition + before / zoom;
        const high = cameraPosition + (viewportExtent - after) / zoom;
        if (rectPosition >= low && rectPosition + rectExtent <= high) return cameraPosition; // already visible
        if (rectExtent > high - low || rectPosition < low) return rectPosition - before / zoom;
        return rectPosition + rectExtent - (viewportExtent - after) / zoom;
      }
      align = 'center';
    }
    if (align === 'start') return rectPosition - before / zoom;
    if (align === 'end') return rectPosition + rectExtent - (viewportExtent - after) / zoom;
    const fraction = align === 'center' ? 0.5 : Math.min(1, Math.max(0, align));
    // Over the viewport moved by half the sides' difference, as `placeCamera` does.
    return (
      rectPosition + rectExtent / 2 - (viewportExtent * fraction + (before - after) / 2) / zoom
    );
  };

  const revealAt = (pageIndex: number, options?: RevealOptions): void => {
    markCause('programmatic');
    const pageCount = ctx.document()?.pageCount ?? 0;
    if (pageCount === 0) return;
    const target = Math.max(0, Math.min(pageIndex, pageCount - 1));
    const positioned =
      !!options &&
      (options.rect !== undefined ||
        options.align !== undefined ||
        (options.zoom !== undefined && options.zoom !== 'keep'));

    if (!positioned) {
      // A bare reveal is not navigation: minimal visibility, cursor untouched.
      if (paged()) {
        // The page is not in the one-item slice: revealing it is navigating to it.
        goToTarget(target, options);
        return;
      }
      const current = buildScene();
      if (!current.itemCount) return;
      const page = pageRectOf(current.items[itemIndexOfPage(target)], target);
      // Reveal the outer box: pageFrame chrome (labels, buttons) belongs to
      // the page, so "make the page visible" includes its reserved bands.
      const frame = worldPageFrame();
      const box = {
        x: page.x - frame.left,
        y: page.y - frame.top,
        width: page.width + frame.left + frame.right,
        height: page.height + frame.top + frame.bottom,
      };
      const next = revealCamera(camera(), box, viewport(), padding());
      const now = camera();
      if (next.x === now.x && next.y === now.y) return; // already visible
      cancelAnimation();
      if ((options?.behavior ?? state().scrollBehavior) === 'smooth') {
        animateTo(next, sceneRect());
      } else {
        writeCamera(next, sceneRect());
      }
      return;
    }

    // A positioned reveal is an arrival at a rect or point (a search hit, a
    // PDF destination). Like navigation, the cursor is intent, set up front
    // (in paged flow this also rebuilds the one-item slice), never derived
    // from a camera that may be mid-tween.
    cancelAnimation();
    ctx.state.update(setCursor, target);

    const place = (): { camera: Camera; bounds: StageRect; zoomChanged: boolean } | null => {
      const current = buildScene();
      if (!current.itemCount) return null;
      const item = paged() ? current.items[0] : current.items[itemIndexOfPage(target)];
      const world = options.rect
        ? worldRectForContent(item, target, options.rect)
        : pageRectOf(item, target);
      const zoomDirective = options.zoom ?? 'keep';
      const inset = padding();
      const availableWidth = Math.max(1, viewport().width - inset.left - inset.right);
      const availableHeight = Math.max(1, viewport().height - inset.top - inset.bottom);
      let zoom =
        typeof zoomDirective === 'object'
          ? zoomDirective.level
          : zoomDirective === 'fit'
            ? Math.min(availableWidth / world.width, availableHeight / world.height)
            : zoomDirective === 'fit-width'
              ? availableWidth / world.width
              : zoomDirective === 'fit-height'
                ? availableHeight / world.height
                : camera().zoom;
      // A degenerate target (a point with a fit directive) only pans.
      if (!Number.isFinite(zoom) || zoom <= 0) zoom = camera().zoom;
      // A tiny rect fits at the zoom limit, centered, like any other zoom.
      zoom = clampZoom(zoom, zoomLimits());
      const zoomChanged = zoomDirective !== 'keep';
      const align = options.align ?? {};
      return {
        camera: {
          x: revealAxis(
            align.x,
            camera().x,
            world.x,
            world.width,
            viewport().width,
            zoom,
            zoomChanged,
            inset.left,
            inset.right,
          ),
          y: revealAxis(
            align.y,
            camera().y,
            world.y,
            world.height,
            viewport().height,
            zoom,
            zoomChanged,
            inset.top,
            inset.bottom,
          ),
          zoom,
        },
        bounds: boundsFor(item),
        zoomChanged,
      };
    };

    const first = place();
    if (!first) return;
    // A resolved zoom becomes the zoom intent (like zoomAround), so later
    // resizes and refits keep the destination's magnification.
    if (first.zoomChanged) {
      ctx.state.update(patchSettings, { zoom: { level: first.camera.zoom } });
    }
    if ((options.behavior ?? state().scrollBehavior) === 'smooth') {
      // If the zoom patch re-wrapped the scene (zoom is a layout input in
      // wrapped mode), recompute once against the new geometry.
      const landing = place() ?? first;
      animateTo(landing.camera, landing.bounds);
    } else {
      stabilized(() => {
        const landing = place();
        if (landing) writeCamera(landing.camera, landing.bounds);
      });
    }
  };

  const reveal = (page: PageRef | number, options?: RevealOptions): void => {
    const index = indexOfTarget(page);
    if (index !== null) whenPlaced(placement, options, (go) => revealAt(index, go));
  };

  const goToDestination = (
    destination: PageDestination,
    options?: GoToDestinationOptions,
  ): void => {
    const layout = ctx.getPage(destination.page);
    if (!layout) return;
    const spot = revealOfDestination(destination, layout.size);
    whenPlaced(placement, { ...spot, behavior: options?.behavior }, (go) =>
      revealAt(layout.index, go),
    );
  };

  return {
    api: { reveal, goToDestination } satisfies Partial<StageHostCapability>,
  };
}
