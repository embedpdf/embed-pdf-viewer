/**
 * Pure alignment snapping for the move gesture. Compares the moving selection's
 * edges + centers against every other annotation on the page (and the page
 * box); if a pair lands within the threshold, nudges the delta to align them
 * and reports a guide line to draw. One snap per axis — the closest wins.
 * Threshold is in content units (the `hitMargin` convention).
 */
import { anchorModeOf } from './anchor';
import { selectionQuad, unionRect } from './geometry';
import { isSelectable } from './hit';
import type { Guide, Id, Model, Rect, Vec } from './types';

export interface SnapResult {
  delta: Vec;
  guides: Guide[];
}

interface Bounds {
  min: Vec;
  max: Vec;
}

/** Overshoot the shapes a little so the guide reads as a through-line. */
const GUIDE_PAD = 14;

const toBounds = (r: Rect): Bounds => ({
  min: { x: r.x, y: r.y },
  max: { x: r.x + r.width, y: r.y + r.height },
});
const keysX = (b: Bounds) => [b.min.x, (b.min.x + b.max.x) / 2, b.max.x];
const keysY = (b: Bounds) => [b.min.y, (b.min.y + b.max.y) / 2, b.max.y];
const shift = (b: Bounds, d: Vec): Bounds => ({
  min: { x: b.min.x + d.x, y: b.min.y + d.y },
  max: { x: b.max.x + d.x, y: b.max.y + d.y },
});

/** An annotation's visual footprint corners — the ORIENTED quad, so a rotated
 *  shape snaps by what's actually drawn, not its unrotated box. */
const annotQuad = (m: Model, id: Id): Vec[] =>
  selectionQuad(m.byId[id].geom, m.byId[id].style.strokeWidth, m.byId[id].style.border);

/**
 * Snap a move delta: shift the selection's union bounds by `raw`, compare its
 * 3 keys per axis (min / center / max) against every target's, and take the
 * closest in-threshold pair per axis as an adjustment. Targets are the page box
 * (edges + center) and every non-moving annotation on the page.
 */
export function computeMoveSnap(
  m: Model,
  ids: Id[],
  pon: number,
  raw: Vec,
  threshold: number,
  pageBox: Rect | undefined,
): SnapResult {
  const moving = new Set(ids);
  // Screen-anchored (`noZoom`/`noRotate`) annotations sit OUTSIDE the snapping
  // system, both ways: their content-space footprint depends on the view, so
  // an alignment made at one zoom is a lie at every other zoom. A selection
  // that contains one doesn't snap; one that's parked on the page is never a
  // reference edge. (The page-edge CLAMP is unaffected — it uses projected
  // bounds per event.)
  if (ids.some((id) => m.byId[id] && anchorModeOf(m.byId[id]))) {
    return { delta: raw, guides: [] };
  }
  const base = toBounds(unionRect(ids.flatMap((id) => annotQuad(m, id))));
  const movingBox = shift(base, raw);

  const targets: Bounds[] = [
    ...(pageBox ? [toBounds(pageBox)] : []),
    ...m.order
      .filter(
        (id) =>
          !moving.has(id) &&
          m.byId[id].pon === pon &&
          isSelectable(m, id) &&
          !anchorModeOf(m.byId[id]),
      )
      .map((id) => toBounds(unionRect(annotQuad(m, id)))),
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
