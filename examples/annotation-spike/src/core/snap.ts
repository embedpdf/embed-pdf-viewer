/**
 * Pure alignment snapping for the move gesture. Compares the moving selection's
 * edges + centers against every other shape (and the page edges/center); if a
 * pair lands within the threshold, nudges the delta to align them and reports a
 * guide line to draw. Threshold is passed in page units (the shell converts px).
 */
import { Bounds, Guide, boundsOf, unionBounds } from './geom';
import { Pt } from './mat2d';
import { Id, Model } from './model';

export interface SnapResult {
  delta: Pt;
  guides: Guide[];
}

const keysX = (b: Bounds) => [b.min.x, (b.min.x + b.max.x) / 2, b.max.x];
const keysY = (b: Bounds) => [b.min.y, (b.min.y + b.max.y) / 2, b.max.y];
const shift = (b: Bounds, dx: number, dy: number): Bounds => ({
  min: { x: b.min.x + dx, y: b.min.y + dy },
  max: { x: b.max.x + dx, y: b.max.y + dy },
});

export function computeMoveSnap(
  m: Model,
  ids: Id[],
  raw: Pt,
  threshold: number,
  page: Bounds,
): SnapResult {
  const moving = new Set(ids);
  const base = unionBounds(ids.map((id) => boundsOf(m.byId[id].transform)));
  const movingBox = shift(base, raw.x, raw.y);

  const targets: Bounds[] = [
    page,
    ...m.order.filter((id) => !moving.has(id)).map((id) => boundsOf(m.byId[id].transform)),
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
  const snapped = shift(base, delta.x, delta.y);
  const PAD = 14; // overshoot the shapes a little so the guide reads as a through-line
  const guides: Guide[] = [];
  if (bx)
    guides.push({
      axis: 'x',
      at: bx.at,
      lo: Math.min(snapped.min.y, bx.tb.min.y) - PAD,
      hi: Math.max(snapped.max.y, bx.tb.max.y) + PAD,
    });
  if (by)
    guides.push({
      axis: 'y',
      at: by.at,
      lo: Math.min(snapped.min.x, by.tb.min.x) - PAD,
      hi: Math.max(snapped.max.x, by.tb.max.x) + PAD,
    });
  return { delta, guides };
}
