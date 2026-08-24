import type { View, ViewManagerAction, ViewManagerState } from './types';

export const initialViewManagerState: ViewManagerState = {
  views: {},
  order: [],
  focusedViewId: null,
  seq: 0,
};

// ── small pure helpers ─────────────────────────────────────────────────────

const insertAt = (list: readonly string[], item: string, index?: number): string[] => {
  const at = index == null ? list.length : Math.max(0, Math.min(index, list.length));
  return [...list.slice(0, at), item, ...list.slice(at)];
};

/** Drop a document and, if it was active, choose a sensible neighbour as active. */
const dropDocument = (view: View, documentId: string): View => {
  const oldIndex = view.documentIds.indexOf(documentId);
  if (oldIndex < 0) return view;
  const documentIds = view.documentIds.filter((id) => id !== documentId);
  const activeDocumentId =
    view.activeDocumentId === documentId
      ? (documentIds[Math.min(oldIndex, documentIds.length - 1)] ?? null)
      : view.activeDocumentId;
  return { ...view, documentIds, activeDocumentId };
};

/** Ensure activeDocumentId is valid for the current documentIds. */
const withValidActive = (view: View): View => {
  if (view.activeDocumentId && view.documentIds.includes(view.activeDocumentId)) return view;
  return { ...view, activeDocumentId: view.documentIds[0] ?? null };
};

const setView = (state: ViewManagerState, view: View): ViewManagerState => ({
  ...state,
  views: { ...state.views, [view.id]: view },
});

// ── reducer ────────────────────────────────────────────────────────────────

export function viewManagerReducer(
  state: ViewManagerState,
  action: ViewManagerAction,
): ViewManagerState {
  switch (action.type) {
    case 'CREATE':
      return {
        ...state,
        views: { ...state.views, [action.view.id]: action.view },
        order: [...state.order, action.view.id],
        focusedViewId: action.view.id,
        seq: state.seq + 1,
      };

    case 'REMOVE': {
      if (!state.views[action.id]) return state;
      const views = { ...state.views };
      delete views[action.id];
      const order = state.order.filter((id) => id !== action.id);
      const focusedViewId =
        state.focusedViewId === action.id ? (order[order.length - 1] ?? null) : state.focusedViewId;
      return { ...state, views, order, focusedViewId };
    }

    case 'REORDER_VIEWS':
      return { ...state, order: action.order };

    case 'SET_FOCUSED':
      return { ...state, focusedViewId: action.id };

    case 'SET_ACTIVE_DOC': {
      const view = state.views[action.viewId];
      if (!view) return state;
      if (action.documentId !== null && !view.documentIds.includes(action.documentId)) return state;
      return setView(state, { ...view, activeDocumentId: action.documentId });
    }

    case 'ADD_DOC': {
      const view = state.views[action.viewId];
      if (!view || view.documentIds.includes(action.documentId)) return state;
      const documentIds = insertAt(view.documentIds, action.documentId, action.index);
      const activeDocumentId = view.activeDocumentId ?? action.documentId;
      return setView(state, { ...view, documentIds, activeDocumentId });
    }

    case 'REMOVE_DOC': {
      const view = state.views[action.viewId];
      if (!view) return state;
      return setView(state, dropDocument(view, action.documentId));
    }

    case 'MOVE_DOC_WITHIN': {
      const view = state.views[action.viewId];
      if (!view || !view.documentIds.includes(action.documentId)) return state;
      const without = view.documentIds.filter((id) => id !== action.documentId);
      const documentIds = insertAt(without, action.documentId, action.toIndex);
      return setView(state, { ...view, documentIds });
    }

    case 'MOVE_DOC_BETWEEN': {
      const from = state.views[action.fromViewId];
      const to = state.views[action.toViewId];
      if (!from || !to || !from.documentIds.includes(action.documentId)) return state;
      if (action.fromViewId === action.toViewId) {
        return viewManagerReducer(state, {
          type: 'MOVE_DOC_WITHIN',
          viewId: action.toViewId,
          documentId: action.documentId,
          toIndex: action.toIndex ?? to.documentIds.length,
        });
      }
      const nextFrom = dropDocument(from, action.documentId);
      const documentIds = insertAt(to.documentIds, action.documentId, action.toIndex);
      const nextTo: View = { ...to, documentIds, activeDocumentId: action.documentId };
      return {
        ...state,
        views: { ...state.views, [nextFrom.id]: nextFrom, [nextTo.id]: nextTo },
        focusedViewId: action.toViewId,
      };
    }

    case 'RECONCILE':
      return reconcile(state, action.open, action.preferViewId);

    default:
      return state;
  }
}

/**
 * Make the views consistent with the set of open documents:
 *  1. drop closed documents from every pane,
 *  2. assign any unassigned open document to the preferred (focused) pane,
 *     creating a default pane if none exists yet.
 * This is what turns "one open document" into "one pane with one tab".
 */
function reconcile(
  state: ViewManagerState,
  open: readonly string[],
  preferViewId: string | null,
): ViewManagerState {
  const openSet = new Set(open);

  // 1. prune closed documents
  const views: Record<string, View> = {};
  for (const id of state.order) {
    const pruned = withValidActive({
      ...state.views[id],
      documentIds: state.views[id].documentIds.filter((d) => openSet.has(d)),
    });
    views[id] = pruned;
  }

  // 2. collect unassigned open documents (preserve open order)
  const assigned = new Set<string>();
  for (const id of state.order) for (const d of views[id].documentIds) assigned.add(d);
  const unassigned = open.filter((d) => !assigned.has(d));

  let { order, focusedViewId, seq } = {
    order: [...state.order],
    focusedViewId: state.focusedViewId,
    seq: state.seq,
  };

  if (unassigned.length > 0) {
    let targetId =
      (preferViewId && views[preferViewId] && preferViewId) ||
      (focusedViewId && views[focusedViewId] && focusedViewId) ||
      order[0] ||
      null;

    if (!targetId) {
      seq += 1;
      targetId = `view-${seq}`;
      views[targetId] = { id: targetId, documentIds: [], activeDocumentId: null };
      order = [...order, targetId];
      focusedViewId = focusedViewId ?? targetId;
    }

    const target = views[targetId];
    views[targetId] = withValidActive({
      ...target,
      documentIds: [...target.documentIds, ...unassigned],
    });
  }

  return { views, order, focusedViewId, seq };
}
