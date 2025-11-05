import { BasePlugin, PluginRegistry, createBehaviorEmitter, DocumentState } from '@embedpdf/core';
import type {
  DocumentManagerCapability,
  DocumentManagerPlugin,
} from '@embedpdf/plugin-document-manager';

import {
  ViewManagerPluginConfig,
  ViewManagerState,
  ViewManagerCapability,
  View,
  ViewChangeEvent,
  ViewActiveDocumentChangedEvent,
  ViewDocumentReorderedEvent,
  ViewDocumentRemovedEvent,
  ViewDocumentAddedEvent,
} from './types';
import {
  ViewManagerAction,
  createView as createViewAction,
  removeView as removeViewAction,
  setFocusedView as setFocusedViewAction,
  setViewActiveDocument,
  moveDocumentWithinView,
  removeDocumentFromView,
  addDocumentToView,
} from './actions';

export class ViewManagerPlugin extends BasePlugin<
  ViewManagerPluginConfig,
  ViewManagerCapability,
  ViewManagerState,
  ViewManagerAction
> {
  static readonly id = 'view-manager' as const;

  private readonly viewCreated$ = createBehaviorEmitter<string>();
  private readonly viewRemoved$ = createBehaviorEmitter<string>();
  private readonly viewFocusChanged$ = createBehaviorEmitter<ViewChangeEvent>();
  private readonly documentAddedToView$ = createBehaviorEmitter<ViewDocumentAddedEvent>();
  private readonly documentRemovedFromView$ = createBehaviorEmitter<ViewDocumentRemovedEvent>();
  private readonly documentReordered$ = createBehaviorEmitter<ViewDocumentReorderedEvent>();
  private readonly viewActiveDocumentChanged$ =
    createBehaviorEmitter<ViewActiveDocumentChangedEvent>();

  // Optional integration with DocumentManager
  private docManagerCapability?: DocumentManagerCapability;

  constructor(
    public readonly id: string,
    registry: PluginRegistry,
    config?: ViewManagerPluginConfig,
  ) {
    super(id, registry);
  }

  protected buildCapability(): ViewManagerCapability {
    return {
      // View lifecycle
      createView: (viewId) => this.createView(viewId),
      removeView: (viewId) => this.removeView(viewId),
      getAllViews: () => this.getAllViews(),
      getViewCount: () => this.getViewCount(),

      // Document management
      addDocumentToView: (viewId, documentId, index) =>
        this.addDocumentToView(viewId, documentId, index),
      removeDocumentFromView: (viewId, documentId) =>
        this.removeDocumentFromView(viewId, documentId),
      moveDocumentWithinView: (viewId, documentId, toIndex) =>
        this.moveDocumentWithinView(viewId, documentId, toIndex),
      moveDocumentBetweenViews: (fromViewId, toViewId, documentId, toIndex) =>
        this.moveDocumentBetweenViews(fromViewId, toViewId, documentId, toIndex),
      setViewActiveDocument: (viewId, documentId) => this.setViewActiveDocument(viewId, documentId),

      // Focus management
      setFocusedView: (viewId) => this.setFocusedView(viewId),
      getFocusedViewId: () => this.state.focusedViewId,
      getFocusedView: () => this.getFocusedView(),

      // Queries
      getView: (viewId) => this.getView(viewId),
      getViewDocuments: (viewId) => this.getViewDocuments(viewId),
      getViewActiveDocument: (viewId) => this.getViewActiveDocument(viewId),
      getDocumentView: (documentId) => this.getDocumentView(documentId),
      isDocumentInAnyView: (documentId) => this.isDocumentInAnyView(documentId),
      getUnassignedDocuments: (documentStates) => this.getUnassignedDocuments(documentStates),

      // Events
      onViewCreated: this.viewCreated$.on,
      onViewRemoved: this.viewRemoved$.on,
      onViewFocusChanged: this.viewFocusChanged$.on,
      onDocumentAddedToView: this.documentAddedToView$.on,
      onDocumentRemovedFromView: this.documentRemovedFromView$.on,
      onDocumentReordered: this.documentReordered$.on,
      onViewActiveDocumentChanged: this.viewActiveDocumentChanged$.on,
    };
  }

  // ─────────────────────────────────────────────────────────
  // Plugin Lifecycle
  // ─────────────────────────────────────────────────────────

  async initialize(config: ViewManagerPluginConfig): Promise<void> {
    // Try to get DocumentManager if it exists (optional dependency)
    const docManager = this.registry.getPlugin<DocumentManagerPlugin>('document-manager');
    if (docManager && docManager.provides) {
      this.docManagerCapability = docManager.provides();

      this.docManagerCapability.onDocumentClosed((documentId) => {
        const viewId = this.getDocumentView(documentId);
        if (viewId) {
          this.removeDocumentFromView(viewId, documentId);
        }
      });
    }

    // Create default views if configured
    if (config.defaultViewCount && config.defaultViewCount > 0) {
      for (let i = 0; i < config.defaultViewCount; i++) {
        this.createView(`view-${i + 1}`);
      }
    }

    this.logger.info('ViewManagerPlugin', 'Initialize', 'View Manager Plugin initialized', {
      defaultViewCount: config.defaultViewCount,
      hasDocumentManager: !!this.docManagerCapability,
    });
  }

  async destroy(): Promise<void> {
    // Clear all emitters
    this.viewCreated$.clear();
    this.viewRemoved$.clear();
    this.viewFocusChanged$.clear();
    this.documentAddedToView$.clear();
    this.documentRemovedFromView$.clear();
    this.documentReordered$.clear();
    this.viewActiveDocumentChanged$.clear();

    super.destroy();
  }

  // ─────────────────────────────────────────────────────────
  // View Lifecycle
  // ─────────────────────────────────────────────────────────

  private createView(viewId?: string): string {
    const id = viewId || this.generateViewId();

    if (this.state.views[id]) {
      this.logger.warn('ViewManagerPlugin', 'CreateView', `View ${id} already exists`);
      return id;
    }

    this.dispatch(createViewAction(id, Date.now()));
    this.viewCreated$.emit(id);

    this.logger.info('ViewManagerPlugin', 'CreateView', `View ${id} created`);

    return id;
  }

  private removeView(viewId: string): void {
    const view = this.state.views[viewId];

    if (!view) {
      this.logger.warn('ViewManagerPlugin', 'RemoveView', `View ${viewId} not found`);
      return;
    }

    // Don't allow removing the last view
    if (this.getViewCount() === 1) {
      this.logger.warn('ViewManagerPlugin', 'RemoveView', 'Cannot remove the last view');
      return;
    }

    this.dispatch(removeViewAction(viewId));
    this.viewRemoved$.emit(viewId);

    this.logger.info('ViewManagerPlugin', 'RemoveView', `View ${viewId} removed`);
  }

  // ─────────────────────────────────────────────────────────
  // Document Assignment
  // ─────────────────────────────────────────────────────────

  // Document Management Methods
  private addDocumentToView(viewId: string, documentId: string, index?: number): void {
    const view = this.state.views[viewId];
    if (!view) {
      throw new Error(`View ${viewId} not found`);
    }

    // Validate document exists if DocumentManager is present
    if (this.docManagerCapability) {
      if (!this.docManagerCapability.isDocumentOpen(documentId)) {
        throw new Error(`Document ${documentId} is not open`);
      }
    }

    // Check if document is already in another view (before state update)
    const previousViewId = this.getDocumentView(documentId);

    // Calculate next active document for the previous view if needed
    let nextActiveDocumentIdForPreviousView: string | null | undefined;
    if (previousViewId && previousViewId !== viewId) {
      nextActiveDocumentIdForPreviousView = this.calculateNextActiveDocumentInView(
        previousViewId,
        documentId,
      );
    }

    // Calculate the actual index - must account for the document being removed from this view
    // if it was already here (though we checked above, the reducer also handles this)
    const actualIndex = index ?? view.documentIds.length;

    this.logger.info(
      'ViewManagerPlugin',
      'AddDocumentToView',
      `Adding document ${documentId} to view ${viewId}`,
      {
        requestedIndex: index,
        calculatedIndex: actualIndex,
        currentDocumentIds: view.documentIds,
        previousViewId,
      },
    );

    this.dispatch(addDocumentToView(viewId, documentId, actualIndex));

    // Handle the previous view if document was moved
    if (previousViewId && previousViewId !== viewId) {
      // Set the next active document in the previous view if needed
      if (nextActiveDocumentIdForPreviousView !== undefined) {
        this.dispatch(setViewActiveDocument(previousViewId, nextActiveDocumentIdForPreviousView));

        // Emit active document changed event for the previous view
        this.viewActiveDocumentChanged$.emit({
          viewId: previousViewId,
          previousDocumentId: documentId,
          currentDocumentId: nextActiveDocumentIdForPreviousView,
        });
      }

      // Emit removal event
      this.documentRemovedFromView$.emit({
        viewId: previousViewId,
        documentId,
      });

      this.logger.info(
        'ViewManagerPlugin',
        'AddDocumentToView',
        `Document ${documentId} moved from view ${previousViewId} to ${viewId}`,
      );
    }

    // Emit addition event
    this.documentAddedToView$.emit({
      viewId,
      documentId,
      index: actualIndex,
    });

    this.logger.info(
      'ViewManagerPlugin',
      'AddDocumentToView',
      `Document ${documentId} added to view ${viewId} at index ${actualIndex}`,
    );
  }

  private removeDocumentFromView(viewId: string, documentId: string): void {
    const view = this.state.views[viewId];
    if (!view) {
      throw new Error(`View ${viewId} not found`);
    }

    if (!view.documentIds.includes(documentId)) {
      this.logger.warn(
        'ViewManagerPlugin',
        'RemoveDocumentFromView',
        `Document ${documentId} not in view ${viewId}`,
      );
      return;
    }

    // Calculate next active document if we're removing the currently active one
    const nextActiveDocumentId = this.calculateNextActiveDocumentInView(viewId, documentId);

    this.dispatch(removeDocumentFromView(viewId, documentId));

    // Set the next active document if needed
    if (nextActiveDocumentId !== undefined) {
      this.dispatch(setViewActiveDocument(viewId, nextActiveDocumentId));

      // Emit active document changed event
      this.viewActiveDocumentChanged$.emit({
        viewId,
        previousDocumentId: documentId,
        currentDocumentId: nextActiveDocumentId,
      });
    }

    this.documentRemovedFromView$.emit({
      viewId,
      documentId,
    });

    this.logger.info(
      'ViewManagerPlugin',
      'RemoveDocumentFromView',
      `Document ${documentId} removed from view ${viewId}`,
    );
  }

  private moveDocumentWithinView(viewId: string, documentId: string, toIndex: number): void {
    const view = this.state.views[viewId];
    if (!view) {
      throw new Error(`View ${viewId} not found`);
    }

    const fromIndex = view.documentIds.indexOf(documentId);
    if (fromIndex === -1) {
      throw new Error(`Document ${documentId} not found in view ${viewId}`);
    }

    if (toIndex < 0 || toIndex >= view.documentIds.length) {
      throw new Error(`Invalid index ${toIndex}`);
    }

    this.dispatch(moveDocumentWithinView(viewId, documentId, toIndex));

    this.documentReordered$.emit({
      viewId,
      documentId,
      fromIndex,
      toIndex,
    });
  }

  private moveDocumentBetweenViews(
    fromViewId: string,
    toViewId: string,
    documentId: string,
    toIndex?: number,
  ): void {
    // Just use addDocumentToView - it handles removing from the source view
    // and all the next active document calculations
    this.addDocumentToView(toViewId, documentId, toIndex);
  }

  private setViewActiveDocument(viewId: string, documentId: string | null): void {
    const view = this.state.views[viewId];
    if (!view) {
      throw new Error(`View ${viewId} not found`);
    }

    if (documentId !== null && !view.documentIds.includes(documentId)) {
      throw new Error(`Document ${documentId} not in view ${viewId}`);
    }

    const previousDocumentId = view.activeDocumentId;
    if (previousDocumentId === documentId) return;

    this.dispatch(setViewActiveDocument(viewId, documentId));

    this.viewActiveDocumentChanged$.emit({
      viewId,
      previousDocumentId,
      currentDocumentId: documentId,
    });
  }

  // Query Methods
  private getViewDocuments(viewId: string): string[] {
    return this.state.views[viewId]?.documentIds ?? [];
  }

  private getViewActiveDocument(viewId: string): string | null {
    return this.state.views[viewId]?.activeDocumentId ?? null;
  }

  private getDocumentView(documentId: string): string | null {
    for (const viewId in this.state.views) {
      if (this.state.views[viewId].documentIds.includes(documentId)) {
        return viewId;
      }
    }
    return null;
  }

  private isDocumentInAnyView(documentId: string): boolean {
    return this.getDocumentView(documentId) !== null;
  }

  private getUnassignedDocuments(documentStates: DocumentState[]): DocumentState[] {
    const assignedDocIds = new Set(Object.values(this.state.views).flatMap((v) => v.documentIds));

    return documentStates.filter((doc) => !assignedDocIds.has(doc.id));
  }

  // ─────────────────────────────────────────────────────────
  // Focus Management
  // ─────────────────────────────────────────────────────────

  private setFocusedView(viewId: string): void {
    if (!this.state.views[viewId]) {
      throw new Error(`View ${viewId} not found`);
    }

    const previousViewId = this.state.focusedViewId;

    if (previousViewId === viewId) {
      return; // Already focused
    }

    this.dispatch(setFocusedViewAction(viewId));

    this.viewFocusChanged$.emit({
      previousViewId,
      currentViewId: viewId,
    });

    this.logger.info(
      'ViewManagerPlugin',
      'SetFocusedView',
      `Focus changed from ${previousViewId} to ${viewId}`,
    );
  }

  // ─────────────────────────────────────────────────────────
  // Queries
  // ─────────────────────────────────────────────────────────

  private getView(viewId: string): View | null {
    return this.state.views[viewId] ?? null;
  }

  private getFocusedView(): View | null {
    const focusedViewId = this.state.focusedViewId;
    if (!focusedViewId) return null;
    return this.getView(focusedViewId);
  }

  private getAllViews(): View[] {
    return this.state.viewOrder
      .map((viewId) => this.state.views[viewId])
      .filter((view): view is View => view !== undefined);
  }

  private getViewCount(): number {
    return Object.keys(this.state.views).length;
  }

  // ─────────────────────────────────────────────────────────
  // Helper Methods
  // ─────────────────────────────────────────────────────────

  /**
   * Calculate the next active document when removing a document from a view
   * Returns undefined if the document being removed is not the active document
   * Returns the next document ID (left first, then right) or null if no documents remain
   */
  private calculateNextActiveDocumentInView(
    viewId: string,
    removingDocumentId: string,
  ): string | null | undefined {
    const view = this.state.views[viewId];
    if (!view) return undefined;

    const currentActiveId = view.activeDocumentId;

    // Only calculate if we're removing the active document
    if (currentActiveId !== removingDocumentId) {
      return undefined;
    }

    const documentIds = view.documentIds;
    const removingIndex = documentIds.indexOf(removingDocumentId);

    if (removingIndex === -1) return undefined;

    // Try left first, then right, then null
    if (removingIndex > 0) {
      return documentIds[removingIndex - 1];
    } else if (removingIndex < documentIds.length - 1) {
      return documentIds[removingIndex + 1];
    } else {
      return null;
    }
  }

  private generateViewId(): string {
    return `view-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
