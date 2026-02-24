import { Position, Rect, Size } from '@embedpdf/models';
import { clamp } from '@embedpdf/core';
import {
  EmbedPdfPointerEvent,
  PointerEventHandlersWithLifecycle,
} from '@embedpdf/plugin-interaction-manager';

export interface MarqueeSelectionHandlerOptions {
  /** The page size for clamping */
  pageSize: Size;
  /** Current scale factor for min drag threshold calculation */
  scale: number;
  /** Minimum drag distance in pixels before considering it a marquee (default: 5) */
  minDragPx?: number;
  /** Check if marquee selection is enabled for this mode */
  isEnabled: (modeId: string) => boolean;
  /** Returns whether text selection is currently active (skip marquee if so) */
  isTextSelecting?: () => boolean;
  /** Called when marquee selection begins */
  onBegin: (startPos: Position, modeId: string) => void;
  /** Called during drag with the current marquee rect */
  onChange: (rect: Rect, modeId: string) => void;
  /** Called when marquee selection completes (drag was large enough) */
  onEnd: (rect: Rect, modeId: string) => void;
  /** Called when marquee selection is cancelled (drag too small or cancelled) */
  onCancel: (modeId: string) => void;
}

/**
 * Creates a marquee selection handler that allows users to drag a selection rectangle.
 *
 * This handler is meant to be combined with the text selection handler. When text is hit,
 * the text selection handler sets its selecting state, and this handler checks via
 * `isTextSelecting` to avoid activating during text selection.
 */
export function createMarqueeSelectionHandler(
  opts: MarqueeSelectionHandlerOptions,
): PointerEventHandlersWithLifecycle<EmbedPdfPointerEvent> {
  const { pageSize, scale, minDragPx = 5 } = opts;

  let start: Position | null = null;
  let last: Rect | null = null;

  return {
    onPointerDown: (pos, evt, modeId) => {
      if (!opts.isEnabled(modeId)) return;
      if (opts.isTextSelecting?.()) return;

      start = pos;
      last = { origin: { x: pos.x, y: pos.y }, size: { width: 0, height: 0 } };
      opts.onBegin(pos, modeId);
      evt.setPointerCapture?.();
    },

    onPointerMove: (pos, _evt, modeId) => {
      if (!start || !opts.isEnabled(modeId)) return;

      // Clamp position to page bounds
      const x = clamp(pos.x, 0, pageSize.width);
      const y = clamp(pos.y, 0, pageSize.height);

      // Build the marquee rect (handle negative drag directions)
      last = {
        origin: { x: Math.min(start.x, x), y: Math.min(start.y, y) },
        size: { width: Math.abs(x - start.x), height: Math.abs(y - start.y) },
      };

      opts.onChange(last, modeId);
    },

    onPointerUp: (_pos, evt, modeId) => {
      if (!opts.isEnabled(modeId)) return;

      if (last && start) {
        // Only commit if the drag was large enough
        const dragPx = Math.max(last.size.width, last.size.height) * scale;
        if (dragPx > minDragPx) {
          opts.onEnd(last, modeId);
        } else {
          opts.onCancel(modeId);
        }
      }

      start = null;
      last = null;
      evt.releasePointerCapture?.();
    },

    onPointerCancel: (_pos, evt, modeId) => {
      if (!opts.isEnabled(modeId)) return;

      start = null;
      last = null;
      opts.onCancel(modeId);
      evt.releasePointerCapture?.();
    },
  };
}
