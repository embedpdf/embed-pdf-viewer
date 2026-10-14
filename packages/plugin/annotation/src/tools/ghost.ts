import {
  fitStampBox,
  gesturePlacement,
  isDrag,
  placedShape,
  resolveClickPlacement,
  unmadeItem,
  type Draft,
  type Model,
  type Point,
  type RenderItem,
  type Shape,
  type ViewEnv,
} from '@embedpdf/core-annotation';
import type { PageRotation } from '@embedpdf/core-geometry';
import type { PageRef } from '@embedpdf/engine-core/runtime';

import type { ImageGhost } from '../contract';
import { setGhostAt, setPlacing, type ForeignPlacement, type GhostPointer } from '../model';
import type { AnnotationContext, AnnotationServices } from '../services';
import type { ResolvedTool } from './definitions';
import { viewEnv } from '../services/geometry';
import { annotationOfTool, iconPlaceAt, isIconPlaceKind } from '../write/placement';
import type { Stamps } from '../write/stamps';

/** The render ids of the tool's ghost and of a sibling plugin's placement in progress. */
const GHOST_ID = 'tool-ghost';
const PLACING_ID = 'tool-placing';

/**
 * Whether the gesture in progress, if any, is still a click, so the ghost
 * still shows what its release makes. A box or a line being drawn is, until
 * it is a drag; any other gesture (a move, a polygon's clicks) is not.
 */
function stillAClick(draft: Draft | null, placing: ForeignPlacement | null): boolean {
  if (placing && isDrag('box', placing.from, placing.to)) return false;
  if (!draft) return true;
  if (draft.kind === 'create-rect') return !isDrag('box', draft.from, draft.to);
  if (draft.kind === 'create-line') return !isDrag('segment', draft.from, draft.to);
  return false;
}

/**
 * The active tool's ghost: what a click at the pointer would make, painted
 * see-through where it will land.
 *
 * A create tool answers one question: if the gesture ended now, what would
 * exist? The ghost is that answer before the press, so it comes from the very
 * calls the commit makes: a click-create tool's `resolveClickPlacement` and
 * `placedShape` (what the core's commit of a click makes), a note's or an
 * attachment's `iconPlaceAt` (the icon placement), an armed stamp's
 * `fitStampBox` (the stamp placement). It paints through `unmadeItem`, as the
 * made annotation will. The state holds only the pointer (`ghostAt`); the
 * ghost is derived from it and the tool's live defaults, so a new color shows
 * without a new hover.
 *
 * When it shows is the handlers' call (tools/handlers.ts): the handler that
 * would take the click shows it on hover, only where nothing above it claims
 * the pointer (an annotation, text) and the user may create, and clears it
 * when its gesture ends. While the press is still a click it stays; once the
 * gesture is a drag, the drawing in progress takes over.
 *
 * A sibling plugin's gesture with one of this plugin's tools (the form
 * palette's drag-to-place) reports itself through `previewPlacement`, and
 * once it is a drag it paints as a drawing in progress, the same way.
 */
export function createGhost(
  ctx: Pick<AnnotationContext, 'state'>,
  { store, geometry, tools }: Pick<AnnotationServices, 'store' | 'geometry' | 'tools'>,
  stamps: Pick<Stamps, 'armed'>,
) {
  const clearGhost = (): void => {
    ctx.state.update(setGhostAt, null);
  };

  /** Whether a click with `tool` places something: an armed stamp, an icon, or its click default. */
  const clickPlaces = (tool: ResolvedTool): boolean =>
    stamps.armed() !== null || isIconPlaceKind(tool.subtype) || tool.clickCreate !== false;

  /** Put the tool's ghost at a hover, or clear it for a tool that shows none there. */
  const hoverGhostAt = (
    toolId: string,
    page: PageRef,
    point: Point,
    displayRotation?: PageRotation,
    zoom?: number,
  ): void => {
    const tool = tools.get(toolId);
    if (
      !tool ||
      tool.ghost === false ||
      !clickPlaces(tool) ||
      !geometry.sizeOf(page.objectNumber)
    ) {
      clearGhost();
      return;
    }
    const pointer: GhostPointer = {
      toolId,
      page,
      point,
      ...(displayRotation !== undefined ? { displayRotation } : {}),
      ...(zoom !== undefined ? { zoom } : {}),
    };
    ctx.state.update(setGhostAt, pointer);
  };

  /**
   * The shape a click with `tool` at the pointer makes, as it will be stored:
   * a note's or an attachment's icon (`iconPlaceAt`, the icon placement), or
   * the tool's click default (`resolveClickPlacement`, the core's click commit).
   */
  const clickShape = (tool: ResolvedTool, pointer: GhostPointer, model: Model): Shape | null => {
    const pageObjectNumber = pointer.page.objectNumber;
    const page = geometry.sizeOf(pageObjectNumber);
    if (!page) return null;
    const annotation = annotationOfTool(model, tool);
    if (isIconPlaceKind(tool.subtype)) {
      const view = viewEnv(pointer.zoom, pointer.displayRotation);
      const { rect } = iconPlaceAt(annotation, pointer.point, page, view);
      return placedShape(annotation, { kind: 'box', rect, rot: 0 });
    }
    if (!tool.clickCreate) return null;
    const placement = resolveClickPlacement(pointer.point, tool.clickCreate, {
      pageBox: geometry.pageBoxOf(pageObjectNumber),
      upright: tool.upright,
      displayRotation: pointer.displayRotation,
    });
    return placedShape(annotation, placement);
  };

  /**
   * What the ghost and a sibling plugin's placement paint on a page, at the
   * view the page shows: the click's annotation at the pointer (`ghost`), and
   * the placement once it is a drag (`draft`). An armed stamp's ghost is an
   * image instead ({@link getImageGhost}).
   */
  const itemsOn = (pageObjectNumber: number, model: Model, view?: ViewEnv): RenderItem[] => {
    const { ghostAt, placing } = ctx.state.get();
    const items: RenderItem[] = [];
    const tool = ghostAt && tools.get(ghostAt.toolId);
    if (
      ghostAt?.page.objectNumber === pageObjectNumber &&
      tool?.ghost &&
      stamps.armed() === null &&
      stillAClick(model.draft, placing)
    ) {
      const shape = clickShape(tool, ghostAt, model);
      if (shape) {
        items.push({
          ...unmadeItem(GHOST_ID, annotationOfTool(model, tool), shape, 'ghost', view),
          ghostOpacity: tool.ghost.opacity,
        });
      }
    }
    const placingTool = placing && tools.get(placing.toolId);
    if (
      placing?.page.objectNumber === pageObjectNumber &&
      placingTool &&
      isDrag('box', placing.from, placing.to)
    ) {
      // The box the sibling's commit places: the same call, the same page box.
      const placement = gesturePlacement('box', placing.from, placing.to, placingTool.clickCreate, {
        pageBox: geometry.pageBoxOf(pageObjectNumber),
      });
      const annotation = annotationOfTool(model, placingTool);
      const shape = placement && placedShape(annotation, placement);
      if (shape) items.push(unmadeItem(PLACING_ID, annotation, shape, 'draft', view));
    }
    return items;
  };

  /**
   * The armed stamp's ghost: its image in the box a click would place it in
   * (`fitStampBox` with the tool's upright turn, as the stamp placement fits
   * it). The same object while nothing it depends on changes.
   */
  let imageGhost: {
    ghostAt: GhostPointer;
    armed: object;
    value: ImageGhost | null;
  } | null = null;
  const getImageGhost = (page: PageRef): ImageGhost | null => {
    const { ghostAt, placing } = ctx.state.get();
    const armed = stamps.armed();
    if (!ghostAt || !armed || ghostAt.page.objectNumber !== page.objectNumber) return null;
    if (!stillAClick(store.model().draft, placing)) return null;
    if (imageGhost?.ghostAt !== ghostAt || imageGhost.armed !== armed) {
      const tool = tools.get(ghostAt.toolId);
      const size = geometry.sizeOf(page.objectNumber);
      const rot = tools.uprightRotFor(ghostAt.displayRotation);
      const value =
        tool?.ghost && size
          ? {
              page,
              box: fitStampBox(ghostAt.point, armed, size, rot),
              rot,
              opacity: tool.ghost.opacity,
            }
          : null;
      imageGhost = { ghostAt, armed, value };
    }
    return imageGhost.value;
  };

  const api = {
    hoverGhostAt,
    clearGhost,
    previewPlacement: (toolId: string, page: PageRef, from: Point, to: Point) => {
      ctx.state.update(setPlacing, { toolId, page, from, to });
    },
    clearPlacementPreview: () => {
      ctx.state.update(setPlacing, null);
    },
    getImageGhost,
  };

  return { itemsOn, api };
}

export type Ghost = ReturnType<typeof createGhost>;
