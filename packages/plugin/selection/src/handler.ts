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
 *  - single click        → deselect; records an anchor but selects nothing until
 *                          the pointer moves past the drag threshold (Chrome/Acrobat feel)
 *  - single-click + drag → caret selection from the anchor (extends across pages)
 *  - double-click        → select the word
 *  - triple-click        → select the visual line
 *  - down off-text       → deselect, and don't capture (so it can't block)
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
  let anchor: {
    page: PageRef;
    point: { x: number; y: number };
    viewportX: number;
    viewportY: number;
  } | null = null;
  let dragging = false;

  return {
    id: 'text-select',
    priority: 60,
    enabledFor: (tool) => tool.enables.has('text-select'),
    onDown: (sample) => {
      anchor = null;
      dragging = false;
      if (!sample.page) return false; // over a gap — let a lower handler (e.g. scroll) try
      if (!selection.canSelect()) return false; // nothing here can engage — stay out of the way
      const { ref: page, point } = sample.page;
      const clicks = sample.clickCount ?? 1;
      // The pointer is down: until it lifts, the gesture is active and
      // selection-scoped UI stays out of the way.
      selection.beginGesture();
      if (clicks >= 3) {
        selection.selectLineAt(page, point);
        return true;
      }
      if (clicks === 2) {
        const selected = selection.selectWordAt(page, point);
        // The platform's "selection changed" tick — only when a touch
        // long-press actually engaged a word (never on blank space, never for
        // a mouse double-click). The gesture marker is the honest signal; a
        // raw double-click sample never carries it.
        if (selected && sample.gesture === 'long-press') feedback?.selection();
        return true;
      }
      // Single click: clear immediately (clicking deselects), then record an
      // anchor only if over text, but begin no selection until the drag
      // threshold is met.
      selection.clear();
      if (!selection.isOverText(page, point)) {
        selection.endGesture(); // empty space → nothing to drive, don't capture
        return false;
      }
      anchor = { page, point, viewportX: sample.viewport.x, viewportY: sample.viewport.y };
      return true;
    },
    onMove: (sample) => {
      if (!sample.page || !anchor) return;
      if (!dragging) {
        const travelled = Math.hypot(
          sample.viewport.x - anchor.viewportX,
          sample.viewport.y - anchor.viewportY,
        );
        if (travelled < dragThreshold) {
          return; // still a click, not a drag — select nothing yet
        }
        dragging = true;
        selection.beginGestureAt(anchor.page, anchor.point); // open the selection at the anchor
      }
      selection.extendTo(sample.page.ref, sample.page.point);
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
    onHover: (sample) => {
      if (!sample.page) {
        interaction.claimCursor(CURSOR_TOKEN, null); // off the page → pointer
        return;
      }
      // Warm geometry on first hover; show the I-beam only when actually over text.
      void selection.ensureLoaded(sample.page.ref);
      const overText = selection.isOverText(sample.page.ref, sample.page.point);
      interaction.claimCursor(CURSOR_TOKEN, overText ? 'text' : null, 10);
    },
  };
}
