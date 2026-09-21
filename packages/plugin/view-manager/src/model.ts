/** The view-manager slice: panes (keyed by id), their order, the focus, and
 *  the id counter. Pure — every transition is here. */
import type { PaneId } from './contract';

/** A pane = one tab strip + one active document. */
export interface Pane {
  readonly id: PaneId;
  /** Documents in this pane, in tab order. */
  readonly documentIds: readonly string[];
  /** The document currently shown in this pane. */
  readonly activeDocumentId: string | null;
}

export interface ViewManagerState {
  readonly panes: Record<string, Pane>;
  /** Display order of the panes. */
  readonly order: readonly PaneId[];
  readonly focusedPaneId: PaneId | null;
  /** Monotonic counter for stable pane ids. */
  readonly seq: number;
}

export type ViewManagerAction =
  | { type: 'CREATE_PANE'; pane: Pane }
  | { type: 'REMOVE_PANE'; id: PaneId }
  | { type: 'REORDER_PANES'; order: readonly PaneId[] }
  | { type: 'SET_FOCUSED'; id: PaneId | null }
  | { type: 'SET_ACTIVE_DOC'; paneId: PaneId; documentId: string | null }
  | { type: 'ADD_DOC'; paneId: PaneId; documentId: string; index?: number }
  | { type: 'REMOVE_DOC'; paneId: PaneId; documentId: string }
  | { type: 'MOVE_DOC_WITHIN'; paneId: PaneId; documentId: string; toIndex: number }
  | {
      type: 'MOVE_DOC_BETWEEN';
      fromPaneId: PaneId;
      toPaneId: PaneId;
      documentId: string;
      toIndex?: number;
    }
  /** Reconcile panes against the open-document set (driven from `connect`). */
  | { type: 'RECONCILE'; open: readonly string[]; preferPaneId: PaneId | null };

export const initialViewManagerState = (): ViewManagerState => ({
  panes: {},
  order: [],
  focusedPaneId: null,
  seq: 0,
});

// ── small pure helpers ─────────────────────────────────────────────────────

const insertAt = (list: readonly string[], item: string, index?: number): string[] => {
  const at = index == null ? list.length : Math.max(0, Math.min(index, list.length));
  return [...list.slice(0, at), item, ...list.slice(at)];
};

/** Drop a document and, if it was active, choose a sensible neighbour as active. */
const dropDocument = (pane: Pane, documentId: string): Pane => {
  const oldIndex = pane.documentIds.indexOf(documentId);
  if (oldIndex < 0) return pane;
  const documentIds = pane.documentIds.filter((id) => id !== documentId);
  const activeDocumentId =
    pane.activeDocumentId === documentId
      ? (documentIds[Math.min(oldIndex, documentIds.length - 1)] ?? null)
      : pane.activeDocumentId;
  return { ...pane, documentIds, activeDocumentId };
};

/** Ensure activeDocumentId is valid for the current documentIds. */
const withValidActive = (pane: Pane): Pane => {
  if (pane.activeDocumentId && pane.documentIds.includes(pane.activeDocumentId)) return pane;
  return { ...pane, activeDocumentId: pane.documentIds[0] ?? null };
};

const setPane = (state: ViewManagerState, pane: Pane): ViewManagerState => ({
  ...state,
  panes: { ...state.panes, [pane.id]: pane },
});

// ── reducer ────────────────────────────────────────────────────────────────

export function viewManagerReducer(
  state: ViewManagerState,
  action: ViewManagerAction,
): ViewManagerState {
  switch (action.type) {
    case 'CREATE_PANE':
      return {
        ...state,
        panes: { ...state.panes, [action.pane.id]: action.pane },
        order: [...state.order, action.pane.id],
        focusedPaneId: action.pane.id,
        seq: state.seq + 1,
      };

    case 'REMOVE_PANE': {
      if (!state.panes[action.id]) return state;
      const panes = { ...state.panes };
      delete panes[action.id];
      const order = state.order.filter((id) => id !== action.id);
      const focusedPaneId =
        state.focusedPaneId === action.id ? (order[order.length - 1] ?? null) : state.focusedPaneId;
      return { ...state, panes, order, focusedPaneId };
    }

    case 'REORDER_PANES':
      return { ...state, order: action.order };

    case 'SET_FOCUSED':
      return { ...state, focusedPaneId: action.id };

    case 'SET_ACTIVE_DOC': {
      const pane = state.panes[action.paneId];
      if (!pane) return state;
      if (action.documentId !== null && !pane.documentIds.includes(action.documentId)) return state;
      return setPane(state, { ...pane, activeDocumentId: action.documentId });
    }

    case 'ADD_DOC': {
      const pane = state.panes[action.paneId];
      if (!pane || pane.documentIds.includes(action.documentId)) return state;
      // Panes PARTITION the open documents: a document already shown in another
      // pane moves, it is never duplicated (G12).
      const holder = Object.values(state.panes).find((v) =>
        v.documentIds.includes(action.documentId),
      );
      const base = holder ? setPane(state, dropDocument(holder, action.documentId)) : state;
      const target = base.panes[action.paneId];
      const documentIds = insertAt(target.documentIds, action.documentId, action.index);
      const activeDocumentId = target.activeDocumentId ?? action.documentId;
      return setPane(base, { ...target, documentIds, activeDocumentId });
    }

    case 'REMOVE_DOC': {
      const pane = state.panes[action.paneId];
      if (!pane) return state;
      return setPane(state, dropDocument(pane, action.documentId));
    }

    case 'MOVE_DOC_WITHIN': {
      const pane = state.panes[action.paneId];
      if (!pane || !pane.documentIds.includes(action.documentId)) return state;
      const without = pane.documentIds.filter((id) => id !== action.documentId);
      const documentIds = insertAt(without, action.documentId, action.toIndex);
      return setPane(state, { ...pane, documentIds });
    }

    case 'MOVE_DOC_BETWEEN': {
      const from = state.panes[action.fromPaneId];
      const to = state.panes[action.toPaneId];
      if (!from || !to || !from.documentIds.includes(action.documentId)) return state;
      if (action.fromPaneId === action.toPaneId) {
        return viewManagerReducer(state, {
          type: 'MOVE_DOC_WITHIN',
          paneId: action.toPaneId,
          documentId: action.documentId,
          toIndex: action.toIndex ?? to.documentIds.length,
        });
      }
      const nextFrom = dropDocument(from, action.documentId);
      const documentIds = insertAt(to.documentIds, action.documentId, action.toIndex);
      const nextTo: Pane = { ...to, documentIds, activeDocumentId: action.documentId };
      return {
        ...state,
        panes: { ...state.panes, [nextFrom.id]: nextFrom, [nextTo.id]: nextTo },
        focusedPaneId: action.toPaneId,
      };
    }

    case 'RECONCILE':
      return reconcile(state, action.open, action.preferPaneId);

    default:
      return state;
  }
}

/**
 * Make the panes consistent with the set of open documents:
 *  1. drop closed documents from every pane,
 *  2. assign any unassigned open document to the preferred (focused) pane,
 *     creating a default pane if none exists yet.
 * This is what turns "one open document" into "one pane with one tab".
 */
function reconcile(
  state: ViewManagerState,
  open: readonly string[],
  preferPaneId: string | null,
): ViewManagerState {
  const openSet = new Set(open);

  // 1. prune closed documents
  const panes: Record<string, Pane> = {};
  for (const id of state.order) {
    const pruned = withValidActive({
      ...state.panes[id],
      documentIds: state.panes[id].documentIds.filter((d) => openSet.has(d)),
    });
    panes[id] = pruned;
  }

  // 2. collect unassigned open documents (preserve open order)
  const assigned = new Set<string>();
  for (const id of state.order) for (const d of panes[id].documentIds) assigned.add(d);
  const unassigned = open.filter((d) => !assigned.has(d));

  let { order, focusedPaneId, seq } = {
    order: [...state.order],
    focusedPaneId: state.focusedPaneId,
    seq: state.seq,
  };

  if (unassigned.length > 0) {
    let targetId =
      (preferPaneId && panes[preferPaneId] && preferPaneId) ||
      (focusedPaneId && panes[focusedPaneId] && focusedPaneId) ||
      order[0] ||
      null;

    if (!targetId) {
      seq += 1;
      targetId = `pane-${seq}`;
      panes[targetId] = { id: targetId, documentIds: [], activeDocumentId: null };
      order = [...order, targetId];
      focusedPaneId = focusedPaneId ?? targetId;
    }

    const target = panes[targetId];
    panes[targetId] = withValidActive({
      ...target,
      documentIds: [...target.documentIds, ...unassigned],
    });
  }

  return { panes, order, focusedPaneId, seq };
}
