import type { PdfRotation } from './primitives';
import type { PageRenderViewport } from '../dto/PageRender';
import { EngineError } from '../errors/EngineError';
import { EngineErrorCode } from '../errors/EngineErrorCode';

/**
 * The pixel size of a render: an area of `width` × `height` points, turned
 * by `rotation` (width and height swap on a quarter turn) and sized by
 * `viewport`. The local worker allocates exactly this; the cloud client
 * reports it without rendering. `InvalidArg` for a viewport that isn't
 * positive.
 */
export function renderSize(
  area: { width: number; height: number },
  rotation: PdfRotation,
  viewport: PageRenderViewport,
): { width: number; height: number } {
  const swap = rotation === 90 || rotation === 270;
  const baseWidth = swap ? area.height : area.width;
  const baseHeight = swap ? area.width : area.height;

  if (viewport.kind === 'width') {
    if (!Number.isFinite(viewport.width) || viewport.width <= 0) {
      throw new EngineError(EngineErrorCode.InvalidArg, 'render viewport width must be positive');
    }
    const width = Math.max(1, Math.round(viewport.width));
    return { width, height: Math.max(1, Math.round((width * baseHeight) / baseWidth)) };
  }

  const scale = viewport.scale ?? 1;
  if (!Number.isFinite(scale) || scale <= 0) {
    throw new EngineError(EngineErrorCode.InvalidArg, 'render viewport scale must be positive');
  }
  return {
    width: Math.max(1, Math.round(baseWidth * scale)),
    height: Math.max(1, Math.round(baseHeight * scale)),
  };
}
