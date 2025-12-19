import { BasePlugin, createBehaviorEmitter, Listener, PluginRegistry } from '@embedpdf/core';
import { PdfPageObject } from '@embedpdf/models';
import {
  SpreadCapability,
  SpreadMode,
  SpreadPluginConfig,
  SpreadState,
  SpreadScope,
  SpreadChangeEvent,
  SpreadDocumentState,
} from './types';
import {
  setSpreadMode,
  initSpreadState,
  cleanupSpreadState,
  SpreadAction,
  setPageGrouping,
} from './actions';
import { ViewportCapability, ViewportPlugin } from '@embedpdf/plugin-viewport';

export class SpreadPlugin extends BasePlugin<
  SpreadPluginConfig,
  SpreadCapability,
  SpreadState,
  SpreadAction
> {
  static readonly id = 'spread' as const;

  private readonly spreadEmitter$ = createBehaviorEmitter<SpreadChangeEvent>();
  private readonly defaultSpreadMode: SpreadMode;
  private readonly viewport: ViewportCapability | null;

  constructor(id: string, registry: PluginRegistry, cfg: SpreadPluginConfig) {
    super(id, registry);
    this.defaultSpreadMode = cfg.defaultSpreadMode ?? SpreadMode.None;

    this.viewport = registry.getPlugin<ViewportPlugin>('viewport')?.provides() ?? null;
  }

  // ─────────────────────────────────────────────────────────
  // Document Lifecycle Hooks (from BasePlugin)
  // ─────────────────────────────────────────────────────────

  protected override onDocumentLoadingStarted(documentId: string): void {
    // Initialize spread state for this document
    const docState: SpreadDocumentState = {
      spreadMode: this.defaultSpreadMode,
    };

    this.dispatch(initSpreadState(documentId, docState));
    this.viewport?.gate('spread', documentId);
    this.logger.debug(
      'SpreadPlugin',
      'DocumentOpened',
      `Initialized spread state for document: ${documentId}`,
    );
  }

  protected override onDocumentLoaded(documentId: string): void {
    // Calculate grouping indices and store in plugin state
    const coreDoc = this.coreState.core.documents[documentId];
    if (coreDoc?.document) {
      const grouping = this.calculatePageGrouping(documentId, coreDoc.document.pages.length);

      // Store grouping in plugin state
      this.dispatch(setPageGrouping(documentId, grouping));
    }
    this.viewport?.releaseGate('spread', documentId);
  }

  protected override onDocumentClosed(documentId: string): void {
    this.dispatch(cleanupSpreadState(documentId));

    this.logger.debug(
      'SpreadPlugin',
      'DocumentClosed',
      `Cleaned up spread state for document: ${documentId}`,
    );
  }

  // ─────────────────────────────────────────────────────────
  // Capability
  // ─────────────────────────────────────────────────────────

  protected buildCapability(): SpreadCapability {
    return {
      // Active document operations
      setSpreadMode: (mode: SpreadMode) => this.setSpreadModeForDocument(mode),
      getSpreadMode: () => this.getSpreadModeForDocument(),
      getSpreadPages: () => this.getSpreadPages(),
      // Document-scoped operations
      forDocument: (documentId: string) => this.createSpreadScope(documentId),

      // Events
      onSpreadChange: this.spreadEmitter$.on,
    };
  }

  // ─────────────────────────────────────────────────────────
  // Document Scoping
  // ─────────────────────────────────────────────────────────

  private createSpreadScope(documentId: string): SpreadScope {
    return {
      setSpreadMode: (mode: SpreadMode) => this.setSpreadModeForDocument(mode, documentId),
      getSpreadMode: () => this.getSpreadModeForDocument(documentId),
      getSpreadPages: () => this.getSpreadPages(documentId),
      onSpreadChange: (listener: Listener<SpreadMode>) =>
        this.spreadEmitter$.on((event) => {
          if (event.documentId === documentId) listener(event.spreadMode);
        }),
    };
  }

  // ─────────────────────────────────────────────────────────
  // State Helpers
  // ─────────────────────────────────────────────────────────
  private getDocumentState(documentId?: string): SpreadDocumentState | null {
    const id = documentId ?? this.getActiveDocumentId();
    return this.state.documents[id] ?? null;
  }

  private getDocumentStateOrThrow(documentId?: string): SpreadDocumentState {
    const state = this.getDocumentState(documentId);
    if (!state) {
      throw new Error(`Spread state not found for document: ${documentId ?? 'active'}`);
    }
    return state;
  }

  // ─────────────────────────────────────────────────────────
  // Core Operations
  // ─────────────────────────────────────────────────────────

  private setSpreadModeForDocument(mode: SpreadMode, documentId?: string): void {
    const id = documentId ?? this.getActiveDocumentId();
    const currentState = this.getDocumentStateOrThrow(id);
    const coreDoc = this.coreState.core.documents[id];

    if (!coreDoc?.document) {
      throw new Error(`Document ${id} not loaded`);
    }

    if (currentState.spreadMode !== mode) {
      // Update plugin state
      this.dispatch(setSpreadMode(id, mode));

      // Calculate new grouping
      const grouping = this.calculatePageGrouping(id, coreDoc.document.pages.length);
      this.dispatch(setPageGrouping(id, grouping));

      // Emit event
      this.spreadEmitter$.emit({
        documentId: id,
        spreadMode: mode,
      });
    }
  }

  private getSpreadModeForDocument(documentId?: string): SpreadMode {
    return this.getDocumentStateOrThrow(documentId).spreadMode;
  }

  /**
   * Calculate page grouping indices based on spread mode
   * Returns indices, not actual page objects
   */
  private calculatePageGrouping(documentId: string, pageCount: number): number[][] {
    const docState = this.getDocumentStateOrThrow(documentId);
    const spreadMode = docState.spreadMode;

    switch (spreadMode) {
      case SpreadMode.None:
        // [[0], [1], [2], [3], ...]
        return Array.from({ length: pageCount }, (_, i) => [i]);

      case SpreadMode.Odd:
        // [[0, 1], [2, 3], [4, 5], ...]
        return Array.from({ length: Math.ceil(pageCount / 2) }, (_, i) => {
          const indices = [i * 2];
          if (i * 2 + 1 < pageCount) indices.push(i * 2 + 1);
          return indices;
        });

      case SpreadMode.Even:
        // [[0], [1, 2], [3, 4], [5, 6], ...]
        return [
          [0],
          ...Array.from({ length: Math.ceil((pageCount - 1) / 2) }, (_, i) => {
            const indices = [1 + i * 2];
            if (1 + i * 2 + 1 < pageCount) indices.push(1 + i * 2 + 1);
            return indices;
          }),
        ];

      default:
        return Array.from({ length: pageCount }, (_, i) => [i]);
    }
  }

  /**
   * Get the actual page objects grouped according to spread mode
   * This is computed on-demand, not stored
   */
  private getSpreadPages(documentId?: string): PdfPageObject[][] {
    const id = documentId ?? this.getActiveDocumentId();
    const coreDoc = this.coreState.core.documents[id];
    const spreadState = this.getDocumentStateOrThrow(id);

    if (!coreDoc?.document) {
      throw new Error(`Document ${id} not loaded`);
    }

    const grouping = spreadState.pageGrouping ?? [];
    const pages = coreDoc.document.pages;

    // Map indices to actual page objects
    return grouping.map((indices) => indices.map((idx) => pages[idx]).filter(Boolean));
  }

  // ─────────────────────────────────────────────────────────
  // Store Update Handlers
  // ─────────────────────────────────────────────────────────

  override onStoreUpdated(prevState: SpreadState, newState: SpreadState): void {
    // Emit spread change events for each changed document
    for (const documentId in newState.documents) {
      const prevDoc = prevState.documents[documentId];
      const newDoc = newState.documents[documentId];

      if (prevDoc?.spreadMode !== newDoc.spreadMode) {
        this.logger.debug(
          'SpreadPlugin',
          'SpreadModeChanged',
          `Spread mode changed for document ${documentId}: ${prevDoc?.spreadMode ?? SpreadMode.None} -> ${newDoc.spreadMode}`,
        );
      }
    }
  }

  // ─────────────────────────────────────────────────────────
  // Lifecycle
  // ─────────────────────────────────────────────────────────

  async initialize(_config: SpreadPluginConfig): Promise<void> {
    this.logger.info('SpreadPlugin', 'Initialize', 'Spread plugin initialized');
  }

  async destroy(): Promise<void> {
    this.spreadEmitter$.clear();
    super.destroy();
  }
}
