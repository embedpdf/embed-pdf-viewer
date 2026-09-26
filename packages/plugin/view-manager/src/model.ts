/**
 * The view-manager's state: panes (keyed by id), their display order, the
 * focused pane, and the counter that makes pane ids unique. Every function
 * below is a pure transition; the controller applies them with
 * `ctx.state.update`.
 *
 * Panes partition the open documents: a document is in at most one pane, so
 * adding it to another pane moves it.
 */
import type { PaneId } from './contract';

/** A pane: one tab strip and the document it currently shows. */
export interface Pane {
  readonly id: PaneId;
  /** Documents in this pane, in tab order. */
  readonly documentIds: readonly string[];
  /** The document currently shown in this pane. */
  readonly activeDocumentId: string | null;
}

export interface ViewManagerState {
  readonly panes: Readonly<Record<string, Pane>>;
  /** Display order of the panes. */
  readonly order: readonly PaneId[];
  readonly focusedPaneId: PaneId | null;
  /** Monotonic counter for unique pane ids. */
  readonly seq: number;
}

export const initialViewManagerState = (): ViewManagerState => ({
  panes: {},
  order: [],
  focusedPaneId: null,
  seq: 0,
});

/** The id the next created pane gets. */
export const nextPaneId = (state: ViewManagerState): PaneId => `pane-${state.seq + 1}`;

/** The pane holding a document, or null. */
export const paneOfDocument = (state: ViewManagerState, documentId: string): PaneId | null =>
  state.order.find((id) => state.panes[id].documentIds.includes(documentId)) ?? null;

// ── helpers ────────────────────────────────────────────────────────────────

const insertAt = (list: readonly string[], item: string, index?: number): string[] => {
  const at = index == null ? list.length : Math.max(0, Math.min(index, list.length));
  return [...list.slice(0, at), item, ...list.slice(at)];
};

/** Drop a document; if it was active, its neighbour becomes active. */
const withoutDocument = (pane: Pane, documentId: string): Pane => {
  const oldIndex = pane.documentIds.indexOf(documentId);
  if (oldIndex < 0) return pane;
  const documentIds = pane.documentIds.filter((id) => id !== documentId);
  const activeDocumentId =
    pane.activeDocumentId === documentId
      ? (documentIds[Math.min(oldIndex, documentIds.length - 1)] ?? null)
      : pane.activeDocumentId;
  return { ...pane, documentIds, activeDocumentId };
};

/** Keep `activeDocumentId` pointing at a document the pane holds. */
const withValidActive = (pane: Pane): Pane => {
  if (pane.activeDocumentId && pane.documentIds.includes(pane.activeDocumentId)) return pane;
  return { ...pane, activeDocumentId: pane.documentIds[0] ?? null };
};

const withPane = (state: ViewManagerState, pane: Pane): ViewManagerState => ({
  ...state,
  panes: { ...state.panes, [pane.id]: pane },
});

// ── transitions ────────────────────────────────────────────────────────────

/** Append an empty pane with the next id and focus it. */
export function createPane(state: ViewManagerState): ViewManagerState {
  const id = nextPaneId(state);
  return {
    ...state,
    panes: { ...state.panes, [id]: { id, documentIds: [], activeDocumentId: null } },
    order: [...state.order, id],
    focusedPaneId: id,
    seq: state.seq + 1,
  };
}

export function removePane(state: ViewManagerState, id: PaneId): ViewManagerState {
  if (!state.panes[id]) return state;
  const { [id]: _removed, ...panes } = state.panes;
  const order = state.order.filter((other) => other !== id);
  const focusedPaneId =
    state.focusedPaneId === id ? (order[order.length - 1] ?? null) : state.focusedPaneId;
  return { ...state, panes, order, focusedPaneId };
}

export function movePane(state: ViewManagerState, id: PaneId, toIndex: number): ViewManagerState {
  const without = state.order.filter((other) => other !== id);
  if (without.length === state.order.length) return state;
  const at = Math.max(0, Math.min(toIndex, without.length));
  return { ...state, order: [...without.slice(0, at), id, ...without.slice(at)] };
}

export function setFocusedPane(state: ViewManagerState, id: PaneId | null): ViewManagerState {
  return state.focusedPaneId === id ? state : { ...state, focusedPaneId: id };
}

export function setActiveDocument(
  state: ViewManagerState,
  paneId: PaneId,
  documentId: string | null,
): ViewManagerState {
  const pane = state.panes[paneId];
  if (!pane || pane.activeDocumentId === documentId) return state;
  if (documentId !== null && !pane.documentIds.includes(documentId)) return state;
  return withPane(state, { ...pane, activeDocumentId: documentId });
}

/** Add a document to a pane; a document another pane holds moves here. */
export function addDocument(
  state: ViewManagerState,
  paneId: PaneId,
  documentId: string,
  index?: number,
): ViewManagerState {
  const pane = state.panes[paneId];
  if (!pane || pane.documentIds.includes(documentId)) return state;
  const holderId = paneOfDocument(state, documentId);
  const base = holderId ? withPane(state, withoutDocument(state.panes[holderId], documentId)) : state;
  const target = base.panes[paneId];
  return withPane(base, {
    ...target,
    documentIds: insertAt(target.documentIds, documentId, index),
    activeDocumentId: target.activeDocumentId ?? documentId,
  });
}

export function removeDocument(
  state: ViewManagerState,
  paneId: PaneId,
  documentId: string,
): ViewManagerState {
  const pane = state.panes[paneId];
  if (!pane) return state;
  const next = withoutDocument(pane, documentId);
  return next === pane ? state : withPane(state, next);
}

export function moveDocumentWithin(
  state: ViewManagerState,
  paneId: PaneId,
  documentId: string,
  toIndex: number,
): ViewManagerState {
  const pane = state.panes[paneId];
  if (!pane || !pane.documentIds.includes(documentId)) return state;
  const without = pane.documentIds.filter((id) => id !== documentId);
  return withPane(state, { ...pane, documentIds: insertAt(without, documentId, toIndex) });
}

export function moveDocumentBetween(
  state: ViewManagerState,
  fromPaneId: PaneId,
  toPaneId: PaneId,
  documentId: string,
  toIndex?: number,
): ViewManagerState {
  const from = state.panes[fromPaneId];
  const to = state.panes[toPaneId];
  if (!from || !to || !from.documentIds.includes(documentId)) return state;
  if (fromPaneId === toPaneId) {
    return moveDocumentWithin(state, toPaneId, documentId, toIndex ?? to.documentIds.length);
  }
  const nextFrom = withoutDocument(from, documentId);
  const nextTo: Pane = {
    ...to,
    documentIds: insertAt(to.documentIds, documentId, toIndex),
    activeDocumentId: documentId,
  };
  return {
    ...state,
    panes: { ...state.panes, [nextFrom.id]: nextFrom, [nextTo.id]: nextTo },
    focusedPaneId: toPaneId,
  };
}

/**
 * Make the panes match the open documents: drop closed documents from every
 * pane, then put each unassigned open document into the preferred pane (the
 * focused one by default), creating a first pane if there is none. This is
 * what turns "one open document" into "one pane with one tab".
 */
export function reconcile(
  state: ViewManagerState,
  open: readonly string[],
  preferPaneId: PaneId | null,
): ViewManagerState {
  const openSet = new Set(open);
  const panes: Record<string, Pane> = {};
  for (const id of state.order) {
    panes[id] = withValidActive({
      ...state.panes[id],
      documentIds: state.panes[id].documentIds.filter((documentId) => openSet.has(documentId)),
    });
  }

  const assigned = new Set(state.order.flatMap((id) => panes[id].documentIds));
  const unassigned = open.filter((documentId) => !assigned.has(documentId));
  let { order, focusedPaneId, seq } = state;

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
