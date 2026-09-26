/**
 * The view-manager controller: reads, verbs that apply the pure transitions
 * in `model.ts`, the pane events derived from each state change, and the
 * reconciliation against the document registry wired in `connect`. It only
 * arranges document ids into panes; it touches no engine and no DOM.
 */
import { DocumentsToken, memo, memoByKey, type PluginContext } from '@embedpdf/core';

import type {
  DocumentMovedEvent,
  PaneEvent,
  PaneFocusChangedEvent,
  PaneInfo,
  ViewManagerCapability,
} from './contract';
import {
  addDocument,
  createPane,
  moveDocumentBetween,
  moveDocumentWithin,
  movePane,
  nextPaneId,
  paneOfDocument,
  reconcile,
  removeDocument,
  removePane,
  setActiveDocument,
  setFocusedPane,
  type ViewManagerState,
} from './model';

const sameIds = (left: readonly string[], right: readonly string[]): boolean =>
  left.length === right.length && left.every((id, index) => id === right[index]);

export function createViewManagerController(ctx: PluginContext<ViewManagerState>) {
  const paneCreated = ctx.events.source<PaneEvent>();
  const paneRemoved = ctx.events.source<PaneEvent>();
  const focusChanged = ctx.events.source<PaneFocusChangedEvent>();
  const documentMoved = ctx.events.source<DocumentMovedEvent>();

  ctx.state.onChange(({ previous, next }) => {
    for (const id of next.order) if (!previous.panes[id]) paneCreated.emit({ paneId: id });
    for (const id of previous.order) if (!next.panes[id]) paneRemoved.emit({ paneId: id });
    if (previous.focusedPaneId !== next.focusedPaneId) {
      focusChanged.emit({ paneId: next.focusedPaneId });
    }
    if (previous.panes === next.panes) return;
    const documentIds = new Set<string>();
    for (const pane of [...Object.values(previous.panes), ...Object.values(next.panes)]) {
      for (const documentId of pane.documentIds) documentIds.add(documentId);
    }
    for (const documentId of documentIds) {
      const fromPaneId = paneOfDocument(previous, documentId);
      const toPaneId = paneOfDocument(next, documentId);
      if (fromPaneId !== toPaneId) documentMoved.emit({ documentId, fromPaneId, toPaneId });
    }
  });

  const state = () => ctx.state.get();

  /** A pane's public shape, the same object until its record changes. */
  const paneInfoOf = memoByKey(
    (id: string) => [state().panes[id]],
    (_id, pane): PaneInfo | null =>
      pane
        ? { id: pane.id, documentIds: pane.documentIds, activeDocumentId: pane.activeDocumentId }
        : null,
  );
  const listPanes = memo(
    () => [state().panes, state().order],
    (_panes, order) => order.map((id) => paneInfoOf(id)!),
  );

  const createPaneWith = (documentIds: readonly string[] = []): string => {
    const id = nextPaneId(state());
    ctx.state.update(createPane);
    for (const documentId of documentIds) ctx.state.update(addDocument, id, documentId);
    return id;
  };

  const api: ViewManagerCapability = {
    listPanes,
    getPane: paneInfoOf,
    getPaneOrder: () => state().order,
    getFocusedPaneId: () => state().focusedPaneId,
    getPaneOfDocument: (documentId) => paneOfDocument(state(), documentId),
    createPane: (options) => createPaneWith(options?.documentIds),
    removePane: (id, options) => {
      const pane = state().panes[id];
      if (!pane) return;
      const remaining = state().order.filter((other) => other !== id);
      const focused = state().focusedPaneId;
      const targetId =
        options?.moveDocumentsTo ??
        (focused !== id ? focused : null) ??
        remaining[remaining.length - 1] ??
        null;
      if (targetId && targetId !== id && state().panes[targetId]) {
        for (const documentId of pane.documentIds) {
          ctx.state.update(moveDocumentBetween, id, targetId, documentId);
        }
      }
      ctx.state.update(removePane, id);
    },
    movePane: (id, toIndex) => ctx.state.update(movePane, id, toIndex),
    setFocusedPane: (id) => ctx.state.update(setFocusedPane, id),
    splitPane: (documentId) => createPaneWith([documentId]),
    setActiveDocument: (paneId, documentId) =>
      ctx.state.update(setActiveDocument, paneId, documentId),
    addDocument: (paneId, documentId, index) =>
      ctx.state.update(addDocument, paneId, documentId, index),
    removeDocument: (paneId, documentId) => ctx.state.update(removeDocument, paneId, documentId),
    moveDocumentWithin: (paneId, documentId, toIndex) =>
      ctx.state.update(moveDocumentWithin, paneId, documentId, toIndex),
    moveDocumentBetween: (fromPaneId, toPaneId, documentId, toIndex) =>
      ctx.state.update(moveDocumentBetween, fromPaneId, toPaneId, documentId, toIndex),
    onPaneCreated: paneCreated.on,
    onPaneRemoved: paneRemoved.on,
    onFocusChanged: focusChanged.on,
    onDocumentMoved: documentMoved.on,
  };

  return {
    api,
    /**
     * Keep panes matching the document registry: newly opened documents land
     * in the focused pane (the first open creates a default pane), and closed
     * documents leave whatever pane held them.
     */
    connect() {
      const documents = ctx.get(DocumentsToken);
      const sync = (open: readonly string[]) =>
        ctx.state.update(reconcile, open, state().focusedPaneId);
      sync(documents.getOrder());
      ctx.watch(() => documents.getOrder(), sync, sameIds);
    },
  };
}
