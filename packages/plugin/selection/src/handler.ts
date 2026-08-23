import type {
  InteractionCapability,
  InteractionHandler,
  PlatformFeedback,
} from '@embedpdf/plugin-interaction';
import type { SelectionHostCapability } from './types';

const CURSOR_TOKEN = 'selection-text';
const DRAG_THRESHOLD_PX = 4; // viewport px the pointer must move before a drag-select begins

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
  interaction: InteractionCapability,
  feedback?: PlatformFeedback,
): InteractionHandler {
  // Per-gesture drag-threshold state (one active gesture at a time — the hub owner).
  let anchor: { pon: number; point: { x: number; y: number }; vx: number; vy: number } | null =
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
      const { pon, point } = s.page;
      const clicks = s.clickCount ?? 1;
      if (clicks >= 3) {
        selection.selectLineAt(pon, point);
        return true;
      }
      if (clicks === 2) {
        const selected = selection.selectWordAt(pon, point);
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
      if (!selection.isOverText(pon, point)) return false; // empty space → don't capture
      anchor = { pon, point, vx: s.viewport.x, vy: s.viewport.y };
      return true;
    },
    onMove: (s) => {
      if (!s.page || !anchor) return;
      if (!dragging) {
        if (Math.hypot(s.viewport.x - anchor.vx, s.viewport.y - anchor.vy) < DRAG_THRESHOLD_PX) {
          return; // still a click, not a drag — select nothing yet
        }
        dragging = true;
        selection.beginAt(anchor.pon, anchor.point); // open the selection at the anchor
      }
      selection.extendTo(s.page.pon, s.page.point);
    },
    onUp: () => {
      anchor = null;
      dragging = false;
      selection.end();
    },
    onCancel: () => {
      // Aborted (second finger → pinch, or a system cancel): drop the
      // in-flight selection instead of committing a sliver of it. end() after
      // clear() settles the `selecting` flag without anything to commit.
      anchor = null;
      dragging = false;
      selection.clear();
      selection.end();
    },
    onHover: (s) => {
      if (!s.page) {
        interaction.setCursor(CURSOR_TOKEN, null); // off the page → pointer
        return;
      }
      // Warm geometry on first hover; show the I-beam ONLY when actually over text.
      selection.ensurePage(s.page.pon);
      const overText = selection.isOverText(s.page.pon, s.page.point);
      interaction.setCursor(CURSOR_TOKEN, overText ? 'text' : null, 10);
    },
  };
}
