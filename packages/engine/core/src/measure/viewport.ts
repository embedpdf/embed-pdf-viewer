import type { PdfViewport } from '../dto/Measure';
import type { PagePoint } from '../geometry/pageSpace';

/**
 * The last viewport whose box holds `point` (the one drawn on top), or
 * `undefined`. A foreign measure still wins; never guess a fallback.
 */
export function viewportForPoint<T extends PdfViewport>(
  viewports: readonly T[],
  point: PagePoint,
): T | undefined {
  return [...viewports]
    .reverse()
    .find(
      ({ bbox: b }) =>
        point.x >= b.x && point.x <= b.x + b.width && point.y >= b.y && point.y <= b.y + b.height,
    );
}
