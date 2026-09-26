/**
 * @embedpdf/plugin-view-manager/contract — panes, tabs, and which document
 * each pane shows. A pane owns a set of documents (its tab strip) and one
 * active document. A document belongs to at most one pane: panes partition
 * the open documents. A document's view state (camera, zoom, layout) lives in
 * the document-scoped stage, so two panes showing different documents have
 * independent cameras.
 */
import type { EventHook } from '@embedpdf/core';

export { ViewManagerToken } from './token';

export type PaneId = string;

/** Public read-only shape of a pane. Reference-stable while unchanged. */
export interface PaneInfo {
  readonly id: PaneId;
  /** Documents in this pane, in tab order. */
  readonly documentIds: readonly string[];
  /** The document currently shown in this pane. */
  readonly activeDocumentId: string | null;
}

// ── events ──
export interface PaneEvent {
  readonly paneId: PaneId;
}
export interface PaneFocusChangedEvent {
  readonly paneId: PaneId | null;
}
export interface DocumentMovedEvent {
  readonly documentId: string;
  readonly fromPaneId: PaneId | null;
  readonly toPaneId: PaneId | null;
}

export interface ViewManagerCapability {
  // ── reading ──
  /** Panes in display order. Reference-stable while unchanged. */
  listPanes(): readonly PaneInfo[];
  getPane(id: PaneId): PaneInfo | null;
  getPaneOrder(): readonly PaneId[];
  getFocusedPaneId(): PaneId | null;
  /** Which pane holds this document, if any. */
  getPaneOfDocument(documentId: string): PaneId | null;

  // ── panes ──
  /** A new pane, optionally populated (documents move from wherever they were). */
  createPane(options?: { documentIds?: readonly string[] }): PaneId;
  /** Remove a pane; its documents go to `moveDocumentsTo` (default: the focused or last remaining pane). */
  removePane(id: PaneId, options?: { moveDocumentsTo?: PaneId }): void;
  /** Move a pane to a new position in the order (drag-reorder panes). */
  movePane(id: PaneId, toIndex: number): void;
  setFocusedPane(id: PaneId | null): void;
  /** A new pane showing the document, in one call. */
  splitPane(documentId: string, options?: { from?: PaneId }): PaneId;

  // ── tabs ──
  /** The tab the pane shows. */
  setActiveDocument(paneId: PaneId, documentId: string | null): void;
  /** Add a document to a pane; a document another pane holds moves (one pane per document). */
  addDocument(paneId: PaneId, documentId: string, index?: number): void;
  removeDocument(paneId: PaneId, documentId: string): void;
  /** Reorder a tab inside its pane. */
  moveDocumentWithin(paneId: PaneId, documentId: string, toIndex: number): void;
  /** Drag a tab from one pane into another. */
  moveDocumentBetween(
    fromPaneId: PaneId,
    toPaneId: PaneId,
    documentId: string,
    toIndex?: number,
  ): void;

  // ── events ──
  readonly onPaneCreated: EventHook<PaneEvent>;
  readonly onPaneRemoved: EventHook<PaneEvent>;
  readonly onFocusChanged: EventHook<PaneFocusChangedEvent>;
  readonly onDocumentMoved: EventHook<DocumentMovedEvent>;
}
