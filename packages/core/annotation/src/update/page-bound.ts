/**
 * Page-bound gestures. Annotations are page-bound; the pointer isn't. Two
 * rules keep them apart:
 *  1. Frame: a gesture is anchored to the page it started on. A sample resolved
 *     against another page is in a different coordinate frame (each page's
 *     page space has its own origin) — subtracting across frames would
 *     teleport the shape to the page top, so foreign-page samples are ignored.
 *  2. Clamp: within the home frame, geometry pins to the page box:
 *     an overshooting pointer slides the shape along the edge; a shape larger
 *     than the page pins to the page's top/left (lo wins when lo > hi).
 */
import type { PageRef } from '@embedpdf/engine-core/runtime';

import { type ViewEnv } from '../anchor';
import { unionRect } from '../rect';
import { annotationSelectionFrame } from '../selection';
import type { Draft, Id, Model, Point, PointerInput, Rect } from '../types';

const clampAxis = (value: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, value));

export const clampPointToBox = (point: Point, box: Rect | undefined): Point =>
  box
    ? {
        x: clampAxis(point.x, box.x, box.x + box.width),
        y: clampAxis(point.y, box.y, box.y + box.height),
      }
    : point;

/** The pointer sample's view environment (relative zoom + display rotation),
 *  when the caller supplied one — screen-anchored annotations hit-test and
 *  page-clamp at their effective geometry with it. Absent → stored geometry
 *  (headless). */
export const viewOf = (input: PointerInput): ViewEnv | undefined =>
  input.zoom != null || input.displayRotation != null
    ? { zoom: input.zoom ?? 1, rotation: input.displayRotation ?? 0 }
    : undefined;

/** The union of the ids' selection frames: what a move keeps inside the page.
 *  A frame takes in everything an annotation paints (a callout's arrow too),
 *  and a screen-anchored member counts at its view-projected footprint. */
export function unionBoundsOf(model: Model, ids: Id[], view?: ViewEnv): Rect | null {
  const corners: Point[] = [];
  for (const id of ids) {
    const record = model.byId[id];
    if (!record) continue;
    corners.push(...annotationSelectionFrame(record, view).corners);
  }
  return corners.length ? unionRect(corners) : null;
}

/** Clamp a move delta so the move-clamp bounds stay inside the page.
 *  Per-axis, so a pointer past the bottom edge still slides the selection
 *  horizontally along that edge. */
export function clampMoveDelta(
  model: Model,
  ids: Id[],
  delta: Point,
  page: Rect | undefined,
  view?: ViewEnv,
): Point {
  if (!page) return delta;
  const rect = unionBoundsOf(model, ids, view);
  if (!rect) return delta;
  return {
    x: clampAxis(delta.x, page.x - rect.x, page.x + page.width - (rect.x + rect.width)),
    y: clampAxis(delta.y, page.y - rect.y, page.y + page.height - (rect.y + rect.height)),
  };
}

/** The page an edit draft is anchored to — every edit gesture lives on one page. */
export function editDraftPage(model: Model, draft: Draft): PageRef | null {
  const id = 'id' in draft ? draft.id : 'ids' in draft && draft.ids.length ? draft.ids[0] : null;
  return id != null ? (model.byId[id]?.annotation.page ?? null) : null;
}
