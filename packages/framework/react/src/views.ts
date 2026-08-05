/**
 * useViews — the React view of @embedpdf/plugin-view-manager.
 *
 * Reactive pane list + intents. The adapter stays headless: it gives you the
 * views; YOU lay them out (split, grid, stacked), render each pane's tab strip
 * over `view.documentIds`, and wrap the body in a <DocumentScope id={activeId}>
 * so its Stage binds to that pane's active document.
 */

// One-line-per-feature: registration travels with the UI.
export * from '@embedpdf/plugin-view-manager';
import { ViewManagerToken } from '@embedpdf/plugin-view-manager';
import type { ViewInfo } from '@embedpdf/plugin-view-manager';
import { useKernel, useKernelValue } from './runtime';

export interface UseViews {
  views: ViewInfo[];
  focusedViewId: string | null;
  documentView: (documentId: string) => string | null;
  createView: () => string;
  removeView: (id: string) => void;
  moveView: (id: string, toIndex: number) => void;
  setFocused: (id: string) => void;
  setActiveDocument: (viewId: string, documentId: string | null) => void;
  addDocument: (viewId: string, documentId: string, index?: number) => void;
  removeDocument: (viewId: string, documentId: string) => void;
  moveDocumentWithin: (viewId: string, documentId: string, toIndex: number) => void;
  moveDocumentBetween: (
    fromViewId: string,
    toViewId: string,
    documentId: string,
    toIndex?: number,
  ) => void;
}

const sameView = (a: ViewInfo, b: ViewInfo): boolean =>
  a.id === b.id &&
  a.activeDocumentId === b.activeDocumentId &&
  a.documentIds.length === b.documentIds.length &&
  a.documentIds.every((d, i) => d === b.documentIds[i]);

export function useViews(): UseViews {
  const kernel = useKernel();
  const vm = kernel.capability(ViewManagerToken);
  const views = useKernelValue(
    () => vm.list(),
    (a, b) => a.length === b.length && a.every((v, i) => sameView(v, b[i])),
  );
  const focusedViewId = useKernelValue(() => vm.focusedViewId());
  return {
    views,
    focusedViewId,
    documentView: vm.documentView,
    createView: vm.createView,
    removeView: vm.removeView,
    moveView: vm.moveView,
    setFocused: vm.setFocused,
    setActiveDocument: vm.setActiveDocument,
    addDocument: vm.addDocument,
    removeDocument: vm.removeDocument,
    moveDocumentWithin: vm.moveDocumentWithin,
    moveDocumentBetween: vm.moveDocumentBetween,
  };
}
