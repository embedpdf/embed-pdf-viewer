/**
 * Pure alignment snapping for the move gesture. Compares the moving selection's
 * edges + centers against every other annotation on the page (and the page
 * box); if a pair lands within the threshold, nudges the delta to align them
 * and reports a guide line to draw. One snap per axis — the closest wins.
 * Threshold is in content units (the `hitMargin` convention).
 */
import type { PageRef } from '@embedpdf/engine-core/runtime';
import { anchorModeOf } from './anchor';
import { selectionQuad, unionRect } from './geometry';
import { isSelectable } from './hit';
import type { Guide, Id, Model, Rect, Point } from './types';

export interface SnapResult {
  delta: Point;
  guides: Guide[];
}

interface Bounds {
  min: Point;
  max: Point;
}

/** Overshoot the shapes a little so the guide reads as a through-line. */
const GUIDE_PAD = 14;

const toBounds = (rect: Rect): Bounds => ({
  min: { x: rect.x, y: rect.y },
  max: { x: rect.x + rect.width, y: rect.y + rect.height },
});
const keysX = (bounds: Bounds) => [bounds.min.x, (bounds.min.x + bounds.max.x) / 2, bounds.max.x];
const keysY = (bounds: Bounds) => [bounds.min.y, (bounds.min.y + bounds.max.y) / 2, bounds.max.y];
const shift = (bounds: Bounds, point: Point): Bounds => ({
  min: { x: bounds.min.x + point.x, y: bounds.min.y + point.y },
  max: { x: bounds.max.x + point.x, y: bounds.max.y + point.y },
});

/** An annotation's visual footprint corners — the oriented quad, so a rotated
 *  shape snaps by what's actually drawn, not its unrotated box. */
const annotQuad = (model: Model, id: Id): Point[] =>
  selectionQuad(
    model.byId[id].geometry,
    model.byId[id].style.strokeWidth,
    model.byId[id].style.border,
  );

/**
 * Snap a move delta: shift the selection's union bounds by `raw`, compare its
 * 3 keys per axis (min / center / max) against every target's, and take the
 * closest in-threshold pair per axis as an adjustment. Targets are the page box
 * (edges + center) and every non-moving annotation on the page.
 */
export function computeMoveSnap(
  model: Model,
  ids: Id[],
  page: PageRef,
  raw: Point,
  threshold: number,
  pageBox: Rect | undefined,
): SnapResult {
  const pageObjectNumber = page.pageObjectNumber;
  const moving = new Set(ids);
  // Screen-anchored (`noZoom`/`noRotate`) annotations sit outside the snapping
  // system, both ways: their content-space footprint depends on the view, so
  // an alignment made at one zoom is a lie at every other zoom. A selection
  // that contains one doesn't snap; one that's parked on the page is never a
  // reference edge. (The page-edge clamp is unaffected — it uses projected
  // bounds per event.)
  if (ids.some((id) => model.byId[id] && anchorModeOf(model.byId[id]))) {
    return { delta: raw, guides: [] };
  }
  const base = toBounds(unionRect(ids.flatMap((id) => annotQuad(model, id))));
  const movingBox = shift(base, raw);

  const targets: Bounds[] = [
    ...(pageBox ? [toBounds(pageBox)] : []),
    ...model.order
      .filter(
        (id) =>
          !moving.has(id) &&
          model.byId[id].page.pageObjectNumber === pageObjectNumber &&
          isSelectable(model, id) &&
          !anchorModeOf(model.byId[id]),
      )
      .map((id) => toBounds(unionRect(annotQuad(model, id)))),
  ];

  let bx: { adjust: number; at: number; tb: Bounds } | null = null;
  let by: { adjust: number; at: number; tb: Bounds } | null = null;
  for (const tb of targets) {
    for (const tk of keysX(tb))
      for (const mk of keysX(movingBox)) {
        const diff = tk - mk;
        if (Math.abs(diff) < threshold && (!bx || Math.abs(diff) < Math.abs(bx.adjust)))
          bx = { adjust: diff, at: tk, tb };
      }
    for (const tk of keysY(tb))
      for (const mk of keysY(movingBox)) {
        const diff = tk - mk;
        if (Math.abs(diff) < threshold && (!by || Math.abs(diff) < Math.abs(by.adjust)))
          by = { adjust: diff, at: tk, tb };
      }
  }

  const delta = { x: raw.x + (bx?.adjust ?? 0), y: raw.y + (by?.adjust ?? 0) };
  const snapped = shift(base, delta);
  const guides: Guide[] = [];
  if (bx)
    guides.push({
      axis: 'x',
      at: bx.at,
      lo: Math.min(snapped.min.y, bx.tb.min.y) - GUIDE_PAD,
      hi: Math.max(snapped.max.y, bx.tb.max.y) + GUIDE_PAD,
    });
  if (by)
    guides.push({
      axis: 'y',
      at: by.at,
      lo: Math.min(snapped.min.x, by.tb.min.x) - GUIDE_PAD,
      hi: Math.max(snapped.max.x, by.tb.max.x) + GUIDE_PAD,
    });
  return { delta, guides };
}
