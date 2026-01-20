import { Position, Rect, Size } from '@embedpdf/models';
import { clamp } from '@embedpdf/core';
import {
  EmbedPdfPointerEvent,
  PointerEventHandlersWithLifecycle,
} from '@embedpdf/plugin-interaction-manager';
import { TrackedAnnotation } from '../types';

/**
 * Check if two rectangles intersect
 */
function rectsIntersect(a: Rect, b: Rect): boolean {
  return !(
    a.origin.x + a.size.width < b.origin.x ||
    b.origin.x + b.size.width < a.origin.x ||
    a.origin.y + a.size.height < b.origin.y ||
    b.origin.y + b.size.height < a.origin.y
  );
}

/**
 * Create a marquee selection handler that allows users to drag a selection rectangle
 * and select all annotations that intersect with it.
 */
export function createMarqueeSelectionHandler(opts: {
  pageSize: Size;
  scale: number;
  /** All annotations on this page */
  annotations: TrackedAnnotation[];
  /** Minimum drag distance in pixels before considering it a marquee selection */
  minDragPx?: number;
  /** Called during drag with the current marquee rect */
  onPreview?: (rect: Rect | null) => void;
  /** Called when marquee selection is committed with the selected annotation IDs */
  onCommit?: (selectedIds: string[]) => void;
}): PointerEventHandlersWithLifecycle<EmbedPdfPointerEvent> {
  const { pageSize, scale, annotations, minDragPx = 5, onPreview, onCommit } = opts;

  let start: Position | null = null;
  let last: Rect | null = null;

  return {
    onPointerDown: (pos, evt) => {
      start = pos;
      last = { origin: { x: pos.x, y: pos.y }, size: { width: 0, height: 0 } };
      onPreview?.(last);
      evt.setPointerCapture?.();
    },

    onPointerMove: (pos) => {
      if (!start) return;

      // Clamp position to page bounds
      const x = clamp(pos.x, 0, pageSize.width);
      const y = clamp(pos.y, 0, pageSize.height);

      // Build the marquee rect (handle negative drag directions)
      last = {
        origin: { x: Math.min(start.x, x), y: Math.min(start.y, y) },
        size: { width: Math.abs(x - start.x), height: Math.abs(y - start.y) },
      };

      onPreview?.(last);
    },

    onPointerUp: (_pos, evt) => {
      if (last) {
        // Only commit if the drag was large enough
        const dragPx = Math.max(last.size.width, last.size.height) * scale;
        if (dragPx > minDragPx) {
          // Find all annotations that intersect with the marquee rect
          const selectedIds = annotations
            .filter((ta) => rectsIntersect(last!, ta.object.rect))
            .map((ta) => ta.object.id);

          onCommit?.(selectedIds);
        }
      }

      start = null;
      last = null;
      onPreview?.(null);
      evt.releasePointerCapture?.();
    },

    onPointerCancel: (_pos, evt) => {
      start = null;
      last = null;
      onPreview?.(null);
      evt.releasePointerCapture?.();
    },
  };
}
