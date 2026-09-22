/**
 * usePanes — the React view of @embedpdf/plugin-view-manager.
 *
 * Reactive pane list + intents. The adapter stays headless: it gives you the
 * panes; you lay them out (split, grid, stacked), render each pane's tab strip
 * over `pane.documentIds`, and wrap the body in a <DocumentScope id={activeId}>
 * so its Stage binds to that pane's active document.
 */

// One-line-per-feature: registration travels with the UI.
export * from '@embedpdf/plugin-view-manager';
import { ViewManagerToken } from '@embedpdf/plugin-view-manager';
import type { PaneId, PaneInfo, ViewManagerCapability } from '@embedpdf/plugin-view-manager';
import type { EventHook } from '@embedpdf/core';
import { useCapability, useCapabilityEvent, useKernel, useKernelValue } from './runtime';

/** The view-manager capability (panes and tabs) for app code. */
export function useViewManager(): ViewManagerCapability {
  return useCapability(ViewManagerToken);
}

/** Subscribe to one view-manager event for the mounted lifetime: `useViewManagerEvent((viewManager) => viewManager.onDocumentMoved, handler)`. */
export function useViewManagerEvent<T>(
  select: (viewManager: ViewManagerCapability) => EventHook<T>,
  handler: (event: T) => void,
): void {
  useCapabilityEvent(ViewManagerToken, select, handler);
}

export interface UsePanes extends Pick<
  ViewManagerCapability,
  | 'getPaneOfDocument'
  | 'createPane'
  | 'removePane'
  | 'movePane'
  | 'setFocusedPane'
  | 'splitPane'
  | 'setActiveDocument'
  | 'addDocument'
  | 'removeDocument'
  | 'moveDocumentWithin'
  | 'moveDocumentBetween'
> {
  /** Panes in display order (reference-stable while unchanged). */
  panes: readonly PaneInfo[];
  focusedPaneId: PaneId | null;
}

export function usePanes(): UsePanes {
  const kernel = useKernel();
  const vm = kernel.capability(ViewManagerToken);
  // `listPanes` is reference-stable, so identity is the right equality.
  const panes = useKernelValue(() => vm.listPanes());
  const focusedPaneId = useKernelValue(() => vm.getFocusedPaneId());
  return {
    panes,
    focusedPaneId,
    getPaneOfDocument: vm.getPaneOfDocument,
    createPane: vm.createPane,
    removePane: vm.removePane,
    movePane: vm.movePane,
    setFocusedPane: vm.setFocusedPane,
    splitPane: vm.splitPane,
    setActiveDocument: vm.setActiveDocument,
    addDocument: vm.addDocument,
    removeDocument: vm.removeDocument,
    moveDocumentWithin: vm.moveDocumentWithin,
    moveDocumentBetween: vm.moveDocumentBetween,
  };
}
