/**
 * The view-manager controller — selectors (pure reads, memoized per pane
 * record) + intents (the only writers), the pane events diffed on every
 * write, and the reconciliation against the document registry wired at
 * `connect`. Pure: no DOM, no engine. It only arranges document ids into panes.
 */
import { createEventHook, DocumentsToken, type PluginContext } from '@embedpdf/core';

import type {
  DocumentMovedEvent,
  PaneEvent,
  PaneFocusChangedEvent,
  PaneId,
  PaneInfo,
  ViewManagerCapability,
} from './contract';
import type { ViewManagerHostCapability } from './host-contract';
import type { Pane, ViewManagerAction, ViewManagerState } from './model';

export function createViewManagerController(
  rawCtx: PluginContext<ViewManagerState, ViewManagerAction>,
): { api: ViewManagerHostCapability; connect(): void } {
  const report = (error: unknown) =>
    globalThis.console?.error('[view-manager] listener failed:', error);
  const paneCreated = createEventHook<PaneEvent>(report);
  const paneRemoved = createEventHook<PaneEvent>(report);
  const focusChanged = createEventHook<PaneFocusChangedEvent>(report);
  const documentMoved = createEventHook<DocumentMovedEvent>(report);
  rawCtx.cleanup(() => {
    for (const hook of [paneCreated, paneRemoved, focusChanged, documentMoved]) hook.dispose();
  });

  const paneOfDocument = (state: ViewManagerState, documentId: string): PaneId | null =>
    state.order.find((id) => state.panes[id].documentIds.includes(documentId)) ?? null;
  const emitDiffs = (before: ViewManagerState, after: ViewManagerState): void => {
    if (before === after) return;
    for (const id of after.order) if (!before.panes[id]) paneCreated.emit({ paneId: id });
    for (const id of before.order) if (!after.panes[id]) paneRemoved.emit({ paneId: id });
    if (before.focusedPaneId !== after.focusedPaneId) {
      focusChanged.emit({ paneId: after.focusedPaneId });
    }
    if (before.panes !== after.panes) {
      const documents = new Set<string>();
      for (const pane of Object.values(before.panes))
        pane.documentIds.forEach((d) => documents.add(d));
      for (const pane of Object.values(after.panes))
        pane.documentIds.forEach((d) => documents.add(d));
      for (const documentId of documents) {
        const from = paneOfDocument(before, documentId);
        const to = paneOfDocument(after, documentId);
        if (from !== to) documentMoved.emit({ documentId, fromPaneId: from, toPaneId: to });
      }
    }
  };
  const ctx: PluginContext<ViewManagerState, ViewManagerAction> = {
    ...rawCtx,
    dispatch: (action) => {
      const before = rawCtx.getState();
      rawCtx.dispatch(action);
      emitDiffs(before, rawCtx.getState());
    },
  };
  const state = () => ctx.getState();

  /** Pane records as the public shape, memoized per record. */
  const infos = new WeakMap<Pane, PaneInfo>();
  const infoOf = (pane: Pane): PaneInfo => {
    let info = infos.get(pane);
    if (!info) {
      info = {
        id: pane.id,
        documentIds: pane.documentIds,
        activeDocumentId: pane.activeDocumentId,
      };
      infos.set(pane, info);
    }
    return info;
  };
  let listedFor: { panes: ViewManagerState['panes']; order: readonly PaneId[] } | null = null;
  let listed: readonly PaneInfo[] = [];
  const listPanes = (): readonly PaneInfo[] => {
    const { panes, order } = state();
    if (listedFor && listedFor.panes === panes && listedFor.order === order) return listed;
    listedFor = { panes, order };
    listed = order.map((id) => infoOf(panes[id]));
    return listed;
  };

  const createPane = (options?: { documentIds?: readonly string[] }): PaneId => {
    const id = `pane-${state().seq + 1}`;
    ctx.dispatch({ type: 'CREATE_PANE', pane: { id, documentIds: [], activeDocumentId: null } });
    for (const documentId of options?.documentIds ?? []) {
      ctx.dispatch({ type: 'ADD_DOC', paneId: id, documentId });
    }
    return id;
  };

  const api = {
    listPanes,
    getPane: (id) => {
      const pane = state().panes[id];
      return pane ? infoOf(pane) : null;
    },
    getPaneOrder: () => state().order,
    getFocusedPaneId: () => state().focusedPaneId,
    getPaneOfDocument: (documentId) => paneOfDocument(state(), documentId),
    createPane,
    removePane: (id, options) => {
      const pane = state().panes[id];
      if (!pane) return;
      const remaining = state().order.filter((other) => other !== id);
      const focused = state().focusedPaneId;
      const target =
        options?.moveDocumentsTo ??
        (focused !== id ? focused : null) ??
        remaining[remaining.length - 1] ??
        null;
      if (target && target !== id && state().panes[target]) {
        for (const documentId of pane.documentIds) {
          ctx.dispatch({ type: 'MOVE_DOC_BETWEEN', fromPaneId: id, toPaneId: target, documentId });
        }
      }
      ctx.dispatch({ type: 'REMOVE_PANE', id });
    },
    movePane: (id, toIndex) => {
      const current = state().order;
      const without = current.filter((x) => x !== id);
      if (without.length === current.length) return; // unknown id
      const at = Math.max(0, Math.min(toIndex, without.length));
      ctx.dispatch({
        type: 'REORDER_PANES',
        order: [...without.slice(0, at), id, ...without.slice(at)],
      });
    },
    setFocusedPane: (id) => ctx.dispatch({ type: 'SET_FOCUSED', id }),
    splitPane: (documentId) => createPane({ documentIds: [documentId] }),
    setActiveDocument: (paneId, documentId) =>
      ctx.dispatch({ type: 'SET_ACTIVE_DOC', paneId, documentId }),
    addDocument: (paneId, documentId, index) =>
      ctx.dispatch({ type: 'ADD_DOC', paneId, documentId, index }),
    removeDocument: (paneId, documentId) =>
      ctx.dispatch({ type: 'REMOVE_DOC', paneId, documentId }),
    moveDocumentWithin: (paneId, documentId, toIndex) =>
      ctx.dispatch({ type: 'MOVE_DOC_WITHIN', paneId, documentId, toIndex }),
    moveDocumentBetween: (fromPaneId, toPaneId, documentId, toIndex) =>
      ctx.dispatch({ type: 'MOVE_DOC_BETWEEN', fromPaneId, toPaneId, documentId, toIndex }),
    onPaneCreated: paneCreated.on,
    onPaneRemoved: paneRemoved.on,
    onFocusChanged: focusChanged.on,
    onDocumentMoved: documentMoved.on,
  } satisfies ViewManagerCapability;

  return {
    api,
    /**
     * Keep panes consistent with the document registry: newly opened documents
     * land in the FOCUSED pane (creating a default pane on first open — "one
     * open document" shows as "one pane, one tab"); closed documents are
     * dropped from whatever pane held them.
     */
    connect() {
      const documents = ctx.get(DocumentsToken);
      let last: string | null = null;
      const reconcile = () => {
        const order = documents.getOrder();
        const key = order.join('|');
        if (key === last) return;
        last = key;
        ctx.dispatch({ type: 'RECONCILE', open: order, preferPaneId: state().focusedPaneId });
      };
      reconcile();
      ctx.cleanup(ctx.subscribe(reconcile));
    },
  };
}
