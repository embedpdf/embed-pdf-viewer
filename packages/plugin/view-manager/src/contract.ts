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
export interface PaneCreatedEvent {
  readonly paneId: PaneId;
}
export interface PaneRemovedEvent {
  readonly paneId: PaneId;
}
export interface PaneFocusChangedEvent {
  /** The focused pane, or null when none has the focus. */
  readonly paneId: PaneId | null;
}
export interface DocumentMovedEvent {
  readonly documentId: string;
  /** The pane it left, or null when it had none (it just opened). */
  readonly fromPaneId: PaneId | null;
  /** The pane it went to, or null when it left every pane (it closed). */
  readonly toPaneId: PaneId | null;
}

/** Options for `splitPane()`. */
export interface SplitPaneOptions {
  /** The pane the new one goes beside; the focused pane when left out. */
  readonly from?: PaneId;
}

/** Options for `createPane()`. */
export interface CreatePaneOptions {
  /** Documents to move into the new pane, in tab order. */
  readonly documentIds?: readonly string[];
}

/** Options for `removePane()`. */
export interface RemovePaneOptions {
  /** The pane that takes the removed pane's documents; the focused or the last pane when left out. */
  readonly moveDocumentsTo?: PaneId;
}

export interface ViewManagerCapability {
  // ── reading ──
  /** Every pane, in order. The same array until a pane changes. */
  listPanes(): readonly PaneInfo[];
  /** One pane, or null when there is none with that id. */
  getPane(id: PaneId): PaneInfo | null;
  /** The panes' ids, in order. */
  getPaneOrder(): readonly PaneId[];
  /** The pane new documents open in, or null. */
  getFocusedPaneId(): PaneId | null;
  /** Which pane holds this document, or null. */
  getPaneOfDocument(documentId: string): PaneId | null;

  // ── panes ──
  /**
   * Add a pane at the end, empty or with these documents moved into it, and focus it. Returns
   * its id. Fires `onPaneCreated`, `onFocusChanged` and `onDocumentMoved` for each document.
   */
  createPane(options?: CreatePaneOptions): PaneId;
  /**
   * Close a pane. Its documents move to `moveDocumentsTo`, or else to the focused or the last
   * pane. Fires `onPaneRemoved`.
   */
  removePane(id: PaneId, options?: RemovePaneOptions): void;
  /** Move a pane to another place in the order, for reordering panes by dragging. */
  movePane(id: PaneId, toIndex: number): void;
  /** Make a pane the focused one, where new documents open; `null` focuses none. Fires `onFocusChanged`. */
  setFocusedPane(id: PaneId | null): void;
  /**
   * Move an open document into a new pane beside the focused one (or beside `from`), and focus
   * it. Returns the new pane's id. Fires as `createPane()` does.
   */
  splitPane(documentId: string, options?: SplitPaneOptions): PaneId;

  // ── tabs ──
  /** Show another of the pane's documents. */
  setActiveDocument(paneId: PaneId, documentId: string | null): void;
  /**
   * Add a document to a pane's tabs. A document is in one pane at a time, so it leaves the pane
   * it was in. Fires `onDocumentMoved`.
   */
  addDocument(paneId: PaneId, documentId: string, index?: number): void;
  /** Take a document out of a pane, without closing it. Fires `onDocumentMoved`. */
  removeDocument(paneId: PaneId, documentId: string): void;
  /** Move a tab to another place inside its pane. */
  moveDocumentWithin(paneId: PaneId, documentId: string, toIndex: number): void;
  /** Move a tab from one pane to another, for dragging tabs between panes. Fires `onDocumentMoved`. */
  moveDocumentBetween(
    fromPaneId: PaneId,
    toPaneId: PaneId,
    documentId: string,
    toIndex?: number,
  ): void;

  // ── events ──
  /** A pane was added. */
  readonly onPaneCreated: EventHook<PaneCreatedEvent>;
  /** A pane was closed. */
  readonly onPaneRemoved: EventHook<PaneRemovedEvent>;
  /** Another pane got the focus, or none has it. */
  readonly onFocusChanged: EventHook<PaneFocusChangedEvent>;
  /** A document moved between panes, or into or out of every pane. */
  readonly onDocumentMoved: EventHook<DocumentMovedEvent>;
}
