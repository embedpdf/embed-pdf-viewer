import { createCapabilityToken } from '@embedpdf/core';

/**
 * A view = one pane. It owns a set of documents (its tab strip) and one active
 * document. A document belongs to exactly ONE view — views PARTITION the open
 * documents. (Comparing two versions of a file = different bytes = different
 * document ids, so the partition is no constraint in practice.)
 *
 * The document's STATE (camera/zoom/layout) lives in the document-scoped Stage,
 * so two panes showing different documents get independent cameras for free.
 */
export interface View {
  readonly id: string;
  /** Documents in this pane, in tab order. */
  readonly documentIds: readonly string[];
  /** The document currently shown in this pane. */
  readonly activeDocumentId: string | null;
}

export interface ViewManagerState {
  readonly views: Record<string, View>;
  /** Display order of the panes. */
  readonly order: readonly string[];
  readonly focusedViewId: string | null;
  /** Monotonic counter for stable view ids. */
  readonly seq: number;
}

export type ViewManagerAction =
  | { type: 'CREATE'; view: View }
  | { type: 'REMOVE'; id: string }
  | { type: 'REORDER_VIEWS'; order: readonly string[] }
  | { type: 'SET_FOCUSED'; id: string | null }
  | { type: 'SET_ACTIVE_DOC'; viewId: string; documentId: string | null }
  | { type: 'ADD_DOC'; viewId: string; documentId: string; index?: number }
  | { type: 'REMOVE_DOC'; viewId: string; documentId: string }
  | { type: 'MOVE_DOC_WITHIN'; viewId: string; documentId: string; toIndex: number }
  | {
      type: 'MOVE_DOC_BETWEEN';
      fromViewId: string;
      toViewId: string;
      documentId: string;
      toIndex?: number;
    }
  /** Reconcile views against the open-document set (effect-driven). */
  | { type: 'RECONCILE'; open: readonly string[]; preferViewId: string | null };

/** Public read-only shape of a view. */
export interface ViewInfo {
  readonly id: string;
  readonly documentIds: string[];
  readonly activeDocumentId: string | null;
}

export interface ViewManagerCapability {
  // ── selectors ──
  /** Views in display order. */
  list(): ViewInfo[];
  order(): string[];
  get(id: string): ViewInfo | null;
  focusedViewId(): string | null;
  /** Which view (pane) currently holds this document, if any. */
  documentView(documentId: string): string | null;

  // ── view lifecycle ──
  /** Create an (empty) pane. Returns the new view id. */
  createView(): string;
  removeView(id: string): void;
  /** Move a pane to a new position in the order (drag-reorder panes). */
  moveView(id: string, toIndex: number): void;
  setFocused(id: string): void;

  // ── documents within a view ──
  /** The tab the pane shows. */
  setActiveDocument(viewId: string, documentId: string | null): void;
  addDocument(viewId: string, documentId: string, index?: number): void;
  removeDocument(viewId: string, documentId: string): void;
  /** Reorder a tab inside its pane. */
  moveDocumentWithin(viewId: string, documentId: string, toIndex: number): void;
  /** Drag a tab from one pane into another. */
  moveDocumentBetween(
    fromViewId: string,
    toViewId: string,
    documentId: string,
    toIndex?: number,
  ): void;
}

export const ViewManagerToken = createCapabilityToken<ViewManagerCapability>('view-manager');
