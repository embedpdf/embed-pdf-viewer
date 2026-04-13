import { Rect } from '@embedpdf/models';

/**
 * Compute a caret annotation rect at the end of a text selection.
 * The caret is half the line height, bottom-aligned with the line,
 * and horizontally centered on the line's end edge.
 */
export function computeCaretRect(lastSegRect: Rect): Rect {
  const lineHeight = lastSegRect.size.height;
  const height = lineHeight / 2;
  const width = height;
  const lineEndX = lastSegRect.origin.x + lastSegRect.size.width;
  return {
    origin: {
      x: lineEndX - width / 2,
      y: lastSegRect.origin.y + lineHeight / 2,
    },
    size: { width, height },
  };
}
