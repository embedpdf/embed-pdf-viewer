/**
 * Robust multi-click counter. `pointerdown.detail` is 0/1 in several browsers,
 * so we count clicks ourselves from timing + proximity — the standard
 * double/triple detection. Input normalization belongs in the adapter; the
 * hub/handlers stay pure.
 *
 * INTERNAL for now — moves to the `/interaction` entry point (its React home)
 * when that vertical lands.
 */
export function createClickCounter(maxGapMs = 400, maxDistPx = 6) {
  let last = 0;
  let lastX = 0;
  let lastY = 0;
  let count = 0;
  return (now: number, x: number, y: number): number => {
    count = now - last <= maxGapMs && Math.hypot(x - lastX, y - lastY) <= maxDistPx ? count + 1 : 1;
    last = now;
    lastX = x;
    lastY = y;
    return count;
  };
}
