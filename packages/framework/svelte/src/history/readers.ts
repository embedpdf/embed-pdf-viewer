/** The history's readers: the API, the state declared once in `historyState`, and its events. */
import type { EventHook } from '@embedpdf/core';
import { HistoryToken, historyState } from '@embedpdf/plugin-history';
import type { HistoryCapability } from '@embedpdf/plugin-history';
import { useCapability, useCapabilityEvent } from '../runtime/readers.svelte';
import { stateReader } from '../runtime/state.svelte';

/**
 * The history API (`undo`, `redo`, `canUndo`, `canRedo`, the labels, `clear`) of the nearest
 * `<DocumentScope>`'s document, else the active one. Outside a ready document, every method
 * throws `not-ready`. `canUndo()` is a read, so `disabled={!history.canUndo()}` updates by itself.
 */
export function useHistory(): HistoryCapability {
  return useCapability(HistoryToken);
}

/**
 * Whether undo and redo can run, and what they would undo and redo (the page's State table,
 * declared once in `historyState`), as a reactive object: `state.canUndo`. With a selector, the
 * value it picks as `{ current }`, which changes only when that value does.
 */
export const useHistoryState = stateReader(historyState);

/** Subscribe to one history event while the component lives: `useHistoryEvent((history) => history.onUndone, handler)`. */
export function useHistoryEvent<T>(
  select: (history: HistoryCapability) => EventHook<T>,
  handler: (event: T) => void,
): void {
  useCapabilityEvent(HistoryToken, select, handler);
}
