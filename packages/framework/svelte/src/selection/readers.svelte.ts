/**
 * The selection plugin's readers: `useSelection()` (the API), `useSelectionState()`,
 * `useSelectionSettings()` and `useSelectionEvent()`. App code gets the public lens; the layers
 * in this folder read the host lens themselves.
 */
import type { EventHook } from '@embedpdf/core';
import { SelectionToken, selectionState } from '@embedpdf/plugin-selection';
import type { SelectionCapability } from '@embedpdf/plugin-selection';
import { useCapability, useCapabilityEvent } from '../runtime/readers.svelte';
import { settingsReader, stateReader } from '../runtime/state.svelte';

/**
 * The public selection API (`select()`, `readText()`, `canCopy()`, …) for app chrome: toolbars,
 * context menus, automation. A handle, always the capability of the document in scope.
 */
export function useSelection(): SelectionCapability {
  return useCapability(SelectionToken);
}

/**
 * The selection's state: whether anything is selected, whether the user is still selecting, the
 * character range and the pages it's on (declared once in `selectionState`), as a reactive object
 * (`state.hasSelection`). With a selector, the value it picks as `{ current }`. Empty without a
 * document.
 */
export const useSelectionState = stateReader(selectionState);

/** The selection settings (`dragThreshold`, `color`, `handles`), with or without a document. */
export const useSelectionSettings = settingsReader(SelectionToken);

/**
 * Subscribe to one selection event while the component lives:
 * `useSelectionEvent((selection) => selection.onCommitted, handler)`.
 */
export function useSelectionEvent<T>(
  select: (selection: SelectionCapability) => EventHook<T>,
  handler: (event: T) => void,
): void {
  useCapabilityEvent(SelectionToken, select, handler);
}
