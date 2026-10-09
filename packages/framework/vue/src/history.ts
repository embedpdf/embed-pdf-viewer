/**
 * @embedpdf/vue/history: the Vue view of `@embedpdf/plugin-history`, undo and
 * redo of what you change through the viewer, one history per open document.
 * An action shows undone at once, even while it is still on its way.
 *
 *   const history = useHistory();
 *   const { canUndo, undoLabel } = useHistoryState();
 *   <button :disabled="!canUndo" @click="history.undo()">Undo</button>
 */

// One line per feature: registration travels with the UI.
export * from '@embedpdf/plugin-history';
import { HistoryToken, historyState } from '@embedpdf/plugin-history';
import type { HistoryCapability } from '@embedpdf/plugin-history';
import type { EventHook } from '@embedpdf/core';
import { useCapability, useCapabilityEvent } from './runtime/capabilities';
import { stateComposable } from './state';

/**
 * The history API (`undo`, `redo`, `canUndo`, `canRedo`, the labels, `clear`) of the nearest
 * `<DocumentScope>`'s document, else the active one. The object never changes; outside a
 * document every method throws `not-ready`.
 */
export function useHistory(): HistoryCapability {
  return useCapability(HistoryToken);
}

/**
 * Whether undo and redo can run, and what they would undo and redo, as refs (the page's State
 * table, declared once in `historyState`). With a selector, one ref for the value it picks,
 * which updates only when that value changes.
 */
export const useHistoryState = stateComposable(historyState);

/** Subscribe to one history event while the component lives: `useHistoryEvent((history) => history.onUndone, handler)`. */
export function useHistoryEvent<Event>(
  select: (history: HistoryCapability) => EventHook<Event>,
  handler: (event: Event) => void,
): void {
  useCapabilityEvent(HistoryToken, select, handler);
}
