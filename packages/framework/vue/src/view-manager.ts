/**
 * @embedpdf/vue/view-manager: the Vue view of `@embedpdf/plugin-view-manager`,
 * panes that each hold their own tabs. It stays headless: it gives you the
 * panes, and you lay them out (split, grid, stacked), draw each pane's tab
 * strip over `pane.documentIds`, and wrap its body in
 * `<DocumentScope :id="pane.activeDocumentId">` so its Stage shows that
 * pane's document.
 */

// One line per feature: registration travels with the UI.
export * from '@embedpdf/plugin-view-manager';
import { ViewManagerToken, viewManagerState } from '@embedpdf/plugin-view-manager';
import type { ViewManagerCapability } from '@embedpdf/plugin-view-manager';
import type { EventHook } from '@embedpdf/core';
import { useCapability, useCapabilityEvent } from './runtime/capabilities';
import { stateComposable } from './state';

/** The view manager's API (panes and their tabs) for app code. The object never changes. */
export function useViewManager(): ViewManagerCapability {
  return useCapability(ViewManagerToken);
}

/**
 * The panes, in order, and the focused one's id, as refs (the page's State
 * table, declared once in `viewManagerState`). With a selector, one ref for
 * the value it picks, which updates only when that value changes.
 */
export const useViewManagerState = stateComposable(viewManagerState);

/** Subscribe to one view-manager event while the component lives: `useViewManagerEvent((viewManager) => viewManager.onDocumentMoved, handler)`. */
export function useViewManagerEvent<Event>(
  select: (viewManager: ViewManagerCapability) => EventHook<Event>,
  handler: (event: Event) => void,
): void {
  useCapabilityEvent(ViewManagerToken, select, handler);
}
