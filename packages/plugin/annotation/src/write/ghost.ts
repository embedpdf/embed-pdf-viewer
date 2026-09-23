import {
  clickCreateGeom,
  defaultsFor,
  fitStampBox,
  geomVisualBounds,
  resolveClickPlacement,
  styleFromProps,
  type ContentGeometry,
  type Rect,
  type Point,
} from '@embedpdf/core-annotation';
import type { PageRotation } from '@embedpdf/core-geometry';
import { toPageRef, type PageRef } from '@embedpdf/engine-core/runtime';

import { ICON_PLACE_SIZE, isIconPlaceKind } from './placement';
import type { AnnotationContext, AnnotationServices } from '../services';
import type { Stamps } from './stamps';
import { setToolGhost } from '../model';
import { pageSizeOf } from '../services/geometry';

/**
 * The armed tool's footprint ghost: where (and what) the next click would
 * place — the stamp's fitted image box, or a click-create tool's default
 * geometry — computed by the same rules the placement uses (WYSIWYG).
 */
export function createGhost(
  ctx: Pick<AnnotationContext, 'state'>,
  { store, geometry, tools }: Pick<AnnotationServices, 'store' | 'geometry' | 'tools'>,
  stamps: Pick<Stamps, 'armed'>,
) {
  const clearGhost = (): void => {
    ctx.state.update(setToolGhost, null);
  };

  /** Paint a vector ghost item for a tool's would-be geometry — shared by the
   *  hover footprint and the externally-driven placement preview. */
  const showVectorGhost = (
    pageObjectNumber: number,
    toolId: string,
    geometry: ContentGeometry,
  ): void => {
    const tool = tools.get(toolId);
    const style = styleFromProps(defaultsFor(store.model(), tool?.preset ?? toolId));
    ctx.state.update(setToolGhost, {
      page: toPageRef(pageObjectNumber),
      box: geomVisualBounds(geometry, style.strokeWidth, style.border),
      rot: 0,
      kind: 'vector',
      toolId,
      geometry,
    });
  };

  /** Move the hover footprint ghost to a content point. The box/geometry is
   *  computed by the same rules the click's placement uses (the stamp fit +
   *  clamp for an armed stamp; the click-create anchor + page clamp for a
   *  draw tool), so the ghost is the placement, not an approximation of it. */
  const hoverAt = (
    toolId: string,
    pageObjectNumber: number,
    point: Point,
    displayRotation?: number,
  ): void => {
    const tool = tools.get(toolId);
    const crop = geometry.cropOf(pageObjectNumber);
    if (!tool || tool.ghost === false || !crop) {
      clearGhost();
      return;
    }
    const page = pageSizeOf(crop);
    // The armed stamp: the fitted image box (the framework blits the preview).
    const armed = stamps.armed();
    if (armed) {
      const rot = tools.uprightRotFor(displayRotation);
      const box = fitStampBox(point, { width: armed.width, height: armed.height }, page, rot);
      ctx.state.update(setToolGhost, {
        page: toPageRef(pageObjectNumber),
        box,
        rot,
        kind: 'image',
      });
      return;
    }
    // Icon kinds: the fixed 20×20 footprint under the cursor — the same box
    // the click's placement uses (fit + clamp), painted as a vector ghost.
    if (isIconPlaceKind(tool.subtype)) {
      const rot = tools.uprightRotFor(displayRotation);
      const box = fitStampBox(point, ICON_PLACE_SIZE, page, rot);
      showVectorGhost(pageObjectNumber, toolId, { kind: 'rect', rect: box, ellipse: false });
      return;
    }
    // A click-create tool: the shared placement layer resolves where the click
    // would land (same call the core's commit makes — preview ≡ commit by
    // construction), and the annotation-only conversion paints it as a vector
    // ghost through pageItems. No kind knowledge lives in this shell.
    if (!tool.clickCreate) {
      clearGhost();
      return;
    }
    const placement = resolveClickPlacement(point, tool.clickCreate, {
      pageBox: { x: 0, y: 0, width: page.width, height: page.height },
      upright: tool.upright,
      displayRotation: displayRotation as PageRotation | undefined,
    });
    const ghostGeometry = clickCreateGeom(
      tool.subtype,
      placement,
      defaultsFor(store.model(), tool.preset),
    );
    if (!ghostGeometry) {
      clearGhost();
      return;
    }
    showVectorGhost(pageObjectNumber, toolId, ghostGeometry);
  };

  /**
   * Drive the placement preview during an externally-owned creation gesture
   * (the form plugin's drag-to-place): paint the box the commit would use,
   * styled from the tool's defaults, through the same ghost pipeline as every
   * footprint. The box is clamped to the page (a drag may overshoot).
   */
  const setPlacementPreview = (toolId: string, pageObjectNumber: number, box: Rect): void => {
    const crop = geometry.cropOf(pageObjectNumber);
    if (!crop) return;
    const page = pageSizeOf(crop);
    const x = Math.max(0, Math.min(box.x, page.width));
    const y = Math.max(0, Math.min(box.y, page.height));
    const rect: Rect = {
      x,
      y,
      width: Math.max(0, Math.min(box.x + box.width, page.width) - x),
      height: Math.max(0, Math.min(box.y + box.height, page.height) - y),
    };
    showVectorGhost(pageObjectNumber, toolId, { kind: 'rect', rect, ellipse: false });
  };

  const api = {
    hoverGhostAt: (toolId: string, page: PageRef, point: Point, displayRotation?: number) =>
      hoverAt(toolId, page.pageObjectNumber, point, displayRotation),
    clearGhost,
    setPlacementPreview: (toolId: string, page: PageRef, box: Rect) =>
      setPlacementPreview(toolId, page.pageObjectNumber, box),
    clearPlacementPreview: clearGhost,
    getToolGhost: (page: PageRef) => {
      const ghost = ctx.state.get().toolGhost;
      return ghost && ghost.page.pageObjectNumber === page.pageObjectNumber ? ghost : null;
    },
  };

  return { api };
}
