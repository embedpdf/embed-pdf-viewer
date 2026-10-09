/**
 * The selection composables: `useSelection()` (the API), `useSelectionState()`,
 * `useSelectionSettings()` and `useSelectionEvent()`. App code gets the public
 * lens only; the layers in this folder resolve the host lens themselves.
 */
import { SelectionToken, selectionState } from '@embedpdf/plugin-selection';
import type { SelectionCapability } from '@embedpdf/plugin-selection';
import type { EventHook } from '@embedpdf/core';
import { useCapability, useCapabilityEvent } from '../runtime/capabilities';
import { settingsComposable, stateComposable } from '../state';

/**
 * The selection API (`select()`, `readText()`, `canCopy()`, …) for your
 * chrome: toolbars, context menus, automation. The object never changes.
 */
export function useSelection(): SelectionCapability {
  return useCapability(SelectionToken);
}

/** Subscribe to one selection event while the component lives: `useSelectionEvent((selection) => selection.onCommitted, handler)`. */
export function useSelectionEvent<Event>(
  select: (selection: SelectionCapability) => EventHook<Event>,
  handler: (event: Event) => void,
): void {
  useCapabilityEvent(SelectionToken, select, handler);
}

/**
 * The selection's state as refs: whether anything is selected, whether the
 * user is still selecting, the range and the pages it's on (the page's State
 * table, declared once in `selectionState`). With a selector, one ref that
 * updates only when the value it picks changes. The empty state without a
 * document.
 */
export const useSelectionState = stateComposable(selectionState);

/** The selection settings (`dragThreshold`, `color`, `handles`), with or without a document, as refs. Takes a selector. */
export const useSelectionSettings = settingsComposable(SelectionToken);
