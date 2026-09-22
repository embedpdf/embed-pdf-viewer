import type {
  InteractionHostCapability,
  InteractionHandler,
  PlatformFeedback,
} from '@embedpdf/plugin-interaction/contract/host';
import type { PageRef } from '@embedpdf/engine-core/runtime';
import type { SelectionHostCapability } from './host-contract';

const CURSOR_TOKEN = 'selection-text';
/** Viewport px the pointer must move before a drag-select begins. */
const DEFAULT_DRAG_THRESHOLD = 4;

export interface TextSelectHandlerOptions {
  dragThreshold?: number;
}

/**
 * The text-selection pointer handler. It is live only under tools that enable the
 * `'text-select'` tag (the built-in `pointer` tool does; `pan` does not — so
 * switching to pan disables text selection with zero special-casing here).
 *
 *  - single click        → deselect; records an anchor but selects NOTHING until
 *                          the pointer moves past the drag threshold (Chrome/Acrobat feel)
 *  - single-click + drag → caret selection from the anchor (extends across pages)
 *  - double-click        → select the word
 *  - triple-click        → select the visual line
 *  - down off-text       → deselect, and DON'T capture (so it can't block)
 *  - hover               → I-beam only when over text, else the pointer cursor
 */
export function createTextSelectHandler(
  selection: SelectionHostCapability,
  interaction: InteractionHostCapability,
  feedback?: PlatformFeedback,
  options: TextSelectHandlerOptions = {},
): InteractionHandler {
  const dragThreshold = options.dragThreshold ?? DEFAULT_DRAG_THRESHOLD;
  // Per-gesture drag-threshold state (one active gesture at a time — the hub owner).
  let anchor: { page: PageRef; point: { x: number; y: number }; vx: number; vy: number } | null =
    null;
  let dragging = false;

  return {
    id: 'text-select',
    priority: 60,
    enabledFor: (tool) => tool.enables.has('text-select'),
    onDown: (s) => {
      anchor = null;
      dragging = false;
      if (!s.page) return false; // over a gap — let a lower handler (e.g. scroll) try
      if (!selection.canSelect()) return false; // nothing here can engage — stay out of the way
      const { ref: page, point } = s.page;
      const clicks = s.clickCount ?? 1;
      // The pointer is down: until it lifts, every change is the user's and
      // selection-scoped UI stays out of the way.
      selection.beginGesture();
      if (clicks >= 3) {
        selection.selectLineAt(page, point);
        return true;
      }
      if (clicks === 2) {
        const selected = selection.selectWordAt(page, point);
        // The platform's "selection changed" tick — ONLY when a touch
        // long-press actually engaged a word (never on blank space, never for
        // a mouse double-click). The gesture marker is the honest signal; a
        // raw double-click sample never carries it.
        if (selected && s.gesture === 'long-press') feedback?.selection();
        return true;
      }
      // Single click: clear immediately (clicking deselects), then record an anchor
      // ONLY if over text — but begin no selection until the drag threshold is met.
      selection.clear();
      if (!selection.isOverText(page, point)) {
        selection.endGesture(); // empty space → nothing to drive, don't capture
        return false;
      }
      anchor = { page, point, vx: s.viewport.x, vy: s.viewport.y };
      return true;
    },
    onMove: (s) => {
      if (!s.page || !anchor) return;
      if (!dragging) {
        if (Math.hypot(s.viewport.x - anchor.vx, s.viewport.y - anchor.vy) < dragThreshold) {
          return; // still a click, not a drag — select nothing yet
        }
        dragging = true;
        selection.beginGestureAt(anchor.page, anchor.point); // open the selection at the anchor
      }
      selection.extendTo(s.page.ref, s.page.point);
    },
    onUp: () => {
      anchor = null;
      dragging = false;
      selection.endGesture();
    },
    onCancel: () => {
      // Aborted (second finger → pinch, or a system cancel): drop the
      // in-flight selection instead of committing a sliver of it. endGesture()
      // after clear() settles the gesture with nothing to commit.
      anchor = null;
      dragging = false;
      selection.clear();
      selection.endGesture();
    },
    onHover: (s) => {
      if (!s.page) {
        interaction.claimCursor(CURSOR_TOKEN, null); // off the page → pointer
        return;
      }
      // Warm geometry on first hover; show the I-beam ONLY when actually over text.
      void selection.ensureLoaded(s.page.ref);
      const overText = selection.isOverText(s.page.ref, s.page.point);
      interaction.claimCursor(CURSOR_TOKEN, overText ? 'text' : null, 10);
    },
  };
}
