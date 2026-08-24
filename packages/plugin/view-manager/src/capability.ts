import type { PluginContext } from '@embedpdf/core';
import type {
  View,
  ViewInfo,
  ViewManagerAction,
  ViewManagerCapability,
  ViewManagerState,
} from './types';

/**
 * The view-manager capability — selectors (pure reads) + intents (the only
 * writers). Pure: no DOM, no engine. It only arranges document ids into panes.
 */
export function createViewManagerCapability(
  ctx: PluginContext<ViewManagerState, ViewManagerAction>,
): ViewManagerCapability {
  const toInfo = (view: View): ViewInfo => ({
    id: view.id,
    documentIds: [...view.documentIds],
    activeDocumentId: view.activeDocumentId,
  });

  return {
    // ── selectors ──
    list: () => {
      const { views, order } = ctx.getState();
      return order.map((id) => toInfo(views[id]));
    },
    order: () => [...ctx.getState().order],
    get: (id) => {
      const view = ctx.getState().views[id];
      return view ? toInfo(view) : null;
    },
    focusedViewId: () => ctx.getState().focusedViewId,
    documentView: (documentId) => {
      const { views, order } = ctx.getState();
      return order.find((id) => views[id].documentIds.includes(documentId)) ?? null;
    },

    // ── view lifecycle ──
    createView: () => {
      const id = `view-${ctx.getState().seq + 1}`;
      ctx.dispatch({ type: 'CREATE', view: { id, documentIds: [], activeDocumentId: null } });
      return id;
    },
    removeView: (id) => ctx.dispatch({ type: 'REMOVE', id }),
    moveView: (id, toIndex) => {
      const current = ctx.getState().order;
      const without = current.filter((x) => x !== id);
      if (without.length === current.length) return; // unknown id
      const clamped = Math.max(0, Math.min(toIndex, without.length));
      const order = [...without.slice(0, clamped), id, ...without.slice(clamped)];
      ctx.dispatch({ type: 'REORDER_VIEWS', order });
    },
    setFocused: (id) => ctx.dispatch({ type: 'SET_FOCUSED', id }),

    // ── documents within a view ──
    setActiveDocument: (viewId, documentId) =>
      ctx.dispatch({ type: 'SET_ACTIVE_DOC', viewId, documentId }),
    addDocument: (viewId, documentId, index) =>
      ctx.dispatch({ type: 'ADD_DOC', viewId, documentId, index }),
    removeDocument: (viewId, documentId) =>
      ctx.dispatch({ type: 'REMOVE_DOC', viewId, documentId }),
    moveDocumentWithin: (viewId, documentId, toIndex) =>
      ctx.dispatch({ type: 'MOVE_DOC_WITHIN', viewId, documentId, toIndex }),
    moveDocumentBetween: (fromViewId, toViewId, documentId, toIndex) =>
      ctx.dispatch({ type: 'MOVE_DOC_BETWEEN', fromViewId, toViewId, documentId, toIndex }),
  };
}
