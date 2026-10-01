/**
 * The React surface for @embedpdf/plugin-view-manager: panes, each with its
 * own tabs. The adapter stays headless: it gives you the panes; you lay them
 * out (split, grid, stacked), render each pane's tab strip over
 * `pane.documentIds`, and wrap the body in a <DocumentScope id={activeId}> so
 * its Stage binds to that pane's active document.
 */

// One-line-per-feature: registration travels with the UI.
export * from '@embedpdf/plugin-view-manager';
import { ViewManagerToken, viewManagerState } from '@embedpdf/plugin-view-manager';
import type { ViewManagerCapability } from '@embedpdf/plugin-view-manager';
import type { EventHook } from '@embedpdf/core';
import { useCapability, useCapabilityEvent } from './runtime';
import { stateHook } from './state';

/** The view-manager API (panes and tabs) for app code. Its object never changes. */
export function useViewManager(): ViewManagerCapability {
  return useCapability(ViewManagerToken);
}

/**
 * The panes, in order, and the focused one's id (the page's State table,
 * declared once in `viewManagerState`). Takes a selector, and re-renders only
 * when what it returns changes.
 */
export const useViewManagerState = stateHook(viewManagerState);

/** Subscribe to one view-manager event for the mounted lifetime: `useViewManagerEvent((viewManager) => viewManager.onDocumentMoved, handler)`. */
export function useViewManagerEvent<T>(
  select: (viewManager: ViewManagerCapability) => EventHook<T>,
  handler: (event: T) => void,
): void {
  useCapabilityEvent(ViewManagerToken, select, handler);
}
