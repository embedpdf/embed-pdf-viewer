import type { PageMeasurementViewport, PdfMeasure, PdfViewport } from '../dto/Measure';
import type { PagePoint } from '../geometry/pageSpace';
import type { PdfSize } from '../geometry/primitives';

/** The name of the viewport a page's scale is written to: the one the engine `owned`. */
export const CALIBRATION_VIEWPORT_NAME = 'EmbedPDF';

/**
 * A page's viewports once its scale is `measure`, as the engine writes it:
 * the last viewport it owns becomes one over the visible page with the new
 * scale, or one is added after the others; `null` removes every one it owns.
 * Other viewports stay as they are.
 */
export function viewportsWithScale(
  viewports: readonly PageMeasurementViewport[],
  size: PdfSize,
  measure: PdfMeasure | null,
): PageMeasurementViewport[] {
  if (measure === null) return viewports.filter((viewport) => !viewport.owned);
  const own: PageMeasurementViewport = {
    bbox: { x: 0, y: 0, width: size.width, height: size.height },
    name: CALIBRATION_VIEWPORT_NAME,
    owned: true,
    measure,
  };
  let last = -1;
  viewports.forEach((viewport, index) => {
    if (viewport.owned) last = index;
  });
  return last < 0
    ? [...viewports, own]
    : viewports.map((viewport, index) => (index === last ? own : viewport));
}

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
