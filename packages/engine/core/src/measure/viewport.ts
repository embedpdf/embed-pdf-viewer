import type { PdfViewport } from '../dto/Measure';
import type { PdfPoint } from '../geometry/primitives';

/** Last containing viewport wins. A foreign measure still wins; never guess a fallback. */
export function viewportForPoint<T extends PdfViewport>(
  viewports: readonly T[],
  point: PdfPoint,
): T | undefined {
  return [...viewports]
    .reverse()
    .find(
      ({ bbox: b }) =>
        point.x >= b.left && point.x <= b.right && point.y >= b.bottom && point.y <= b.top,
    );
}
