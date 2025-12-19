import { BasePluginConfig, EventHook, DocumentState } from '@embedpdf/core';

export interface ViewManagerPluginConfig extends BasePluginConfig {
  // Optional: Default number of views to create on init
  defaultViewCount?: number;
}

export interface View {
  id: string;
  documentIds: string[]; // Array of documents in this view
  activeDocumentId: string | null; // Which document is currently active in this view
  createdAt: number;
}

export interface ViewManagerState {
  views: Record<string, View>;
  viewOrder: string[];
  focusedViewId: string | null;
}

export interface ViewChangeEvent {
  previousViewId: string | null;
  currentViewId: string | null;
}

export interface ViewDocumentAddedEvent {
  viewId: string;
  documentId: string;
  index: number;
}

export interface ViewDocumentRemovedEvent {
  viewId: string;
  documentId: string;
}

export interface ViewDocumentReorderedEvent {
  viewId: string;
  documentId: string;
  fromIndex: number;
  toIndex: number;
}

export interface ViewActiveDocumentChangedEvent {
  viewId: string;
  previousDocumentId: string | null;
  currentDocumentId: string | null;
}

export interface ViewManagerCapability {
  // View lifecycle
  createView(viewId?: string): string;
  removeView(viewId: string): void;
  getAllViews(): View[];
  getViewCount(): number;

  // Document management within views
  addDocumentToView(viewId: string, documentId: string, index?: number): void;
  removeDocumentFromView(viewId: string, documentId: string): void;
  moveDocumentWithinView(viewId: string, documentId: string, toIndex: number): void;
  moveDocumentBetweenViews(
    fromViewId: string,
    toViewId: string,
    documentId: string,
    toIndex?: number,
  ): void;
  setViewActiveDocument(viewId: string, documentId: string | null): void;

  // Focus management
  setFocusedView(viewId: string): void;
  getFocusedViewId(): string | null;
  getFocusedView(): View | null;

  // Queries
  getView(viewId: string): View | null;
  getViewDocuments(viewId: string): string[];
  getViewActiveDocument(viewId: string): string | null;
  getDocumentView(documentId: string): string | null; // Which view has this doc?
  isDocumentInAnyView(documentId: string): boolean;
  getUnassignedDocuments(documentStates: DocumentState[]): DocumentState[];

  // Events
  onViewCreated: EventHook<string>;
  onViewRemoved: EventHook<string>;
  onViewFocusChanged: EventHook<ViewChangeEvent>;
  onDocumentAddedToView: EventHook<ViewDocumentAddedEvent>;
  onDocumentRemovedFromView: EventHook<ViewDocumentRemovedEvent>;
  onDocumentReordered: EventHook<ViewDocumentReorderedEvent>;
  onViewActiveDocumentChanged: EventHook<ViewActiveDocumentChangedEvent>;
}
