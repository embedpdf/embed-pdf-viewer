import { getQuadBaselineEnd, Quad, Rect, rectToQuad } from '@embedpdf/models';

/**
 * Compute a caret annotation rect at the end of a text selection.
 * Uses the oriented segment quad baseline when available.
 */
export function computeCaretRect(lastSegRect: Rect, lastSegQuad?: Quad): Rect {
  const quad = lastSegQuad ?? rectToQuad(lastSegRect);
  const baselineEnd = getQuadBaselineEnd(quad);
  const lineHeight = lastSegRect.size.height;
  const height = lineHeight / 2;
  const width = height;

  return {
    origin: {
      x: baselineEnd.x - width / 2,
      y: baselineEnd.y - height,
    },
    size: { width, height },
  };
}
