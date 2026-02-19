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
  /** Called when drag-selection begins on a glyph */
  onBegin: (glyphIndex: number, modeId: string) => void;
  /** Called when drag-selection updates to a new glyph */
  onUpdate: (glyphIndex: number, modeId: string) => void;
  /** Called when drag-selection ends (pointer up) */
  onEnd: (modeId: string) => void;
  /** Called to clear the current selection */
  onClear: (modeId: string) => void;
  /** Returns whether text selection is currently in progress */
  isSelecting: () => boolean;
  /** Set or remove the text cursor */
  setCursor: (cursor: string | null) => void;
  /** Called when the user clicks directly on empty page space (target === currentTarget) */
  onEmptySpaceClick?: (modeId: string) => void;
  /** Called on double-click over a glyph; receives the char index */
  onWordSelect?: (glyphIndex: number, modeId: string) => void;
  /** Called on triple-click over a glyph; receives the char index */
  onLineSelect?: (glyphIndex: number, modeId: string) => void;
  /**
   * Signals whether the text handler has claimed a pointer-down (anchor set)
   * even before the drag threshold is met. Used to prevent the marquee handler
   * from activating concurrently.
   */
  setHasTextAnchor?: (active: boolean) => void;
  /**
   * Minimum drag distance (in page-coordinate units) before a pointer-down
   * starts an actual selection drag. Default: 3.
   */
  minDragDistance?: number;
  /** Tolerance factor passed through to glyphAt. Default: 0.9. */
  toleranceFactor?: number;
}

const TRIPLE_CLICK_INTERVAL_MS = 500;

/**
 * Creates a text selection handler that manages pointer-based text selection,
 * double-click word selection, triple-click line selection, and a drag threshold.
 *
 * Behaviour modelled after Chromium's PDFiumEngine (pdfium-engine.cc):
 *  - Single pointer-down records an anchor but does NOT begin selection until
 *    the pointer has moved beyond `minDragDistance`.
 *  - Double-click selects the word around the clicked glyph.
 *  - Triple-click selects the full visual line.
 *  - The marquee handler coordinates via `isTextSelecting` / `hasTextAnchor`
 *    to avoid activating during text selection.
 */
export function createTextSelectionHandler(
  opts: TextSelectionHandlerOptions,
): PointerEventHandlersWithLifecycle<EmbedPdfPointerEvent> {
  const minDrag = opts.minDragDistance ?? 3;
  const tolFactor = opts.toleranceFactor ?? 0.9;

  // Drag-threshold state
  let anchorGlyph: number | null = null;
  let anchorPos: Position | null = null;
  let dragStarted = false;

  // Triple-click detection: timestamp of the most recent dblclick
  let lastDblClickTime = 0;

  function reset() {
    anchorGlyph = null;
    anchorPos = null;
    dragStarted = false;
    opts.setHasTextAnchor?.(false);
  }

  return {
    onPointerDown: (point: Position, evt, modeId) => {
      // Detect click on empty page space (fires for ALL modes)
      if (evt.target === evt.currentTarget) {
        opts.onEmptySpaceClick?.(modeId);
      }

      if (!opts.isEnabled(modeId)) return;

      // Skip clearing if we're in the triple-click window — the onClick
      // handler will expand the existing word selection to a line selection.
      const now = Date.now();
      if (lastDblClickTime === 0 || now - lastDblClickTime >= TRIPLE_CLICK_INTERVAL_MS) {
        opts.onClear(modeId);
      }

      const geo = opts.getGeometry();
      if (!geo) return;

      const g = glyphAt(geo, point, tolFactor);
      if (g !== -1) {
        anchorGlyph = g;
        anchorPos = point;
        dragStarted = false;
        opts.setHasTextAnchor?.(true);
      }
    },

    onPointerMove: (point: Position, _evt, modeId) => {
      if (!opts.isEnabled(modeId)) return;

      const geo = opts.getGeometry();
      if (!geo) return;

      const g = glyphAt(geo, point, tolFactor);

      // Update cursor based on whether we're over text
      opts.setCursor(g !== -1 ? 'text' : null);

      // If we have an anchor but haven't started dragging, check threshold
      if (anchorGlyph !== null && anchorPos && !dragStarted) {
        const dx = point.x - anchorPos.x;
        const dy = point.y - anchorPos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist >= minDrag) {
          dragStarted = true;
          opts.onBegin(anchorGlyph, modeId);
          if (g !== -1) {
            opts.onUpdate(g, modeId);
          }
        }
        return;
      }

      // Continue extending the selection during an active drag
      if (opts.isSelecting() && g !== -1) {
        opts.onUpdate(g, modeId);
      }
    },

    onPointerUp: (_point: Position, _evt, modeId) => {
      if (!opts.isEnabled(modeId)) {
        reset();
        return;
      }

      if (dragStarted) {
        opts.onEnd(modeId);
      }

      reset();
    },

    onDoubleClick: (point: Position, _evt, modeId) => {
      if (!opts.isEnabled(modeId)) return;

      const geo = opts.getGeometry();
      if (!geo) return;

      const g = glyphAt(geo, point, tolFactor);
      if (g === -1) return;

      lastDblClickTime = Date.now();
      opts.onWordSelect?.(g, modeId);
    },

    onClick: (point: Position, _evt, modeId) => {
      if (!opts.isEnabled(modeId)) return;

      // Triple-click detection: a click arriving shortly after a dblclick
      if (lastDblClickTime === 0) return;

      const now = Date.now();
      if (now - lastDblClickTime > TRIPLE_CLICK_INTERVAL_MS) {
        lastDblClickTime = 0;
        return;
      }

      lastDblClickTime = 0;

      const geo = opts.getGeometry();
      if (!geo) return;

      const g = glyphAt(geo, point, tolFactor);
      if (g === -1) return;

      opts.onLineSelect?.(g, modeId);
    },

    onHandlerActiveEnd: (modeId) => {
      reset();
      if (!opts.isEnabled(modeId)) return;
      opts.onClear(modeId);
    },
  };
}
