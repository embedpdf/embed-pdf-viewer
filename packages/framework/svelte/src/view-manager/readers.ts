/**
 * The view manager's readers: the API, the panes as a reactive object, and its events. The view
 * manager is a workspace plugin, so all three work before any document opens.
 */
import type { EventHook } from '@embedpdf/core';
import { ViewManagerToken, viewManagerState } from '@embedpdf/plugin-view-manager';
import type { ViewManagerCapability } from '@embedpdf/plugin-view-manager';
import { useCapability, useCapabilityEvent } from '../runtime/readers.svelte';
import { stateReader } from '../runtime/state.svelte';

/** The view manager's API (panes and their tabs), for app code. */
export function useViewManager(): ViewManagerCapability {
  return useCapability(ViewManagerToken);
}

/**
 * The panes, in order, and the focused one's id (the page's State table, declared once in
 * `viewManagerState`), as a reactive object: `state.panes`. With a selector, the value it picks as
 * `{ current }`, which changes only when that value does.
 */
export const useViewManagerState = stateReader(viewManagerState);

/** Subscribe to one view-manager event while the component lives: `useViewManagerEvent((viewManager) => viewManager.onDocumentMoved, handler)`. */
export function useViewManagerEvent<T>(
  select: (viewManager: ViewManagerCapability) => EventHook<T>,
  handler: (event: T) => void,
): void {
  useCapabilityEvent(ViewManagerToken, select, handler);
}
