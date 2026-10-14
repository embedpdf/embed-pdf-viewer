/**
 * The React surface for @embedpdf/plugin-history: undo and redo of what you
 * change through the viewer, one history per open document. An action shows
 * undone at once, even while it is still on its way to the engine.
 *
 *   const history = useHistory();
 *   const { canUndo, undoLabel } = useHistoryState();
 *   <button disabled={!canUndo} onClick={() => history.undo()}>Undo</button>
 */

// One-line-per-feature: registration travels with the UI.
export * from '@embedpdf/plugin-history';
import type { EventHook } from '@embedpdf/core';
import { HistoryToken, historyState, type HistoryCapability } from '@embedpdf/plugin-history';

import { useCapability, useCapabilityEvent } from './runtime';
import { stateHook } from './state';

/**
 * The history (undo, redo, canUndo, canRedo, the labels, clear) of the
 * surrounding `<DocumentScope>`'s document, else the active one. Outside a
 * document, every method throws `not-ready`.
 */
export function useHistory(): HistoryCapability {
  return useCapability(HistoryToken);
}

/**
 * Whether undo and redo can run, and what they would undo and redo (the
 * page's State table, declared once in `historyState`). Takes a selector, and
 * re-renders only when what it returns changes.
 */
export const useHistoryState = stateHook(historyState);

/** Subscribe to one history event for the mounted lifetime: `useHistoryEvent((history) => history.onUndone, handler)`. */
export function useHistoryEvent<T>(
  select: (history: HistoryCapability) => EventHook<T>,
  handler: (event: T) => void,
): void {
  useCapabilityEvent(HistoryToken, select, handler);
}
