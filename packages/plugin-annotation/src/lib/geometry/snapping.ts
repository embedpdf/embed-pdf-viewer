import { Position } from '@embedpdf/models';

/**
 * Snap the segment `start → end` to the nearest `stepDeg` angular increment,
 * preserving the segment's length. Used for hold-Shift axis/angle constraint
 * while drawing lines and polygons (15° increments give horizontal, vertical
 * and 45° diagonals for free).
 */
export function snapAngle(start: Position, end: Position, stepDeg = 15): Position {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return end;
  const step = (stepDeg * Math.PI) / 180;
  const snapped = Math.round(Math.atan2(dy, dx) / step) * step;
  return { x: start.x + len * Math.cos(snapped), y: start.y + len * Math.sin(snapped) };
}

/**
 * Snap `pos` to the nearest `candidates` point within `thresholdPx` screen
 * pixels (converted to page units via `scale`). Returns the snapped candidate,
 * or `pos` unchanged when none is within range. Used to snap measurement
 * points to existing geometry vertices for precise, satisfying placement.
 */
export function snapToVertex(
  pos: Position,
  candidates: Position[],
  thresholdPx: number,
  scale: number,
): Position {
  const threshold = thresholdPx / Math.max(scale, 0.0001);
  let best: Position | null = null;
  let bestDist = threshold;
  for (const c of candidates) {
    const d = Math.hypot(c.x - pos.x, c.y - pos.y);
    if (d <= bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return best ?? pos;
}
