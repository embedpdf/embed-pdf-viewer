import { PdfPageGeometry, Position } from '@embedpdf/models';
import {
  EmbedPdfPointerEvent,
  PointerEventHandlersWithLifecycle,
} from '@embedpdf/plugin-interaction-manager';
import { glyphAt } from '../utils';

export interface TextSelectionHandlerOptions {
  /** Returns the page geometry, or undefined if not loaded yet */
  getGeometry: () => PdfPageGeometry | undefined;
  /** Check if selection is enabled for this mode */
  isEnabled: (modeId: string) => boolean;
  /** Called when selection begins on a glyph */
  onBegin: (glyphIndex: number) => void;
  /** Called when selection updates to a new glyph */
  onUpdate: (glyphIndex: number) => void;
  /** Called when selection ends (pointer up) */
  onEnd: () => void;
  /** Called to clear the current selection */
  onClear: () => void;
  /** Returns whether text selection is currently in progress */
  isSelecting: () => boolean;
  /** Set or remove the text cursor */
  setCursor: (cursor: string | null) => void;
}

/**
 * Creates a text selection handler that manages pointer-based text selection.
 *
 * When text is hit on pointerdown, the handler calls `stopImmediatePropagation()`
 * to prevent other handlers (e.g., marquee) from processing the event.
 */
export function createTextSelectionHandler(
  opts: TextSelectionHandlerOptions,
): PointerEventHandlersWithLifecycle<EmbedPdfPointerEvent> {
  return {
    onPointerDown: (point: Position, evt, modeId) => {
      if (!opts.isEnabled(modeId)) return;

      // Clear the current selection
      opts.onClear();

      // Get geometry from cache
      const geo = opts.getGeometry();
      if (geo) {
        const g = glyphAt(geo, point);
        if (g !== -1) {
          opts.onBegin(g);
          // Prevent other handlers (e.g., marquee) from processing this event
          evt.stopImmediatePropagation();
        }
      }
    },

    onPointerMove: (point: Position, evt, modeId) => {
      if (!opts.isEnabled(modeId)) return;

      // Get cached geometry
      const geo = opts.getGeometry();
      if (geo) {
        const g = glyphAt(geo, point);

        // Update cursor based on whether we're over text
        opts.setCursor(g !== -1 ? 'text' : null);

        // Update selection if we're actively selecting
        if (opts.isSelecting() && g !== -1) {
          opts.onUpdate(g);
          // Prevent other handlers from processing this event
          evt.stopImmediatePropagation();
        }
      }
    },

    onPointerUp: (_point: Position, _evt, modeId) => {
      if (!opts.isEnabled(modeId)) return;
      opts.onEnd();
    },

    onHandlerActiveEnd: (modeId) => {
      if (!opts.isEnabled(modeId)) return;
      opts.onClear();
    },
  };
}
