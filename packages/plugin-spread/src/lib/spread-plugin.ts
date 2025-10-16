import {
  BasePlugin,
  createBehaviorEmitter,
  Listener,
  PluginRegistry,
  setPages,
} from '@embedpdf/core';
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
import { setSpreadMode, initSpreadState, cleanupSpreadState, SpreadAction } from './actions';

export class SpreadPlugin extends BasePlugin<
  SpreadPluginConfig,
  SpreadCapability,
  SpreadState,
  SpreadAction
> {
  static readonly id = 'spread' as const;

  private readonly spreadEmitter$ = createBehaviorEmitter<SpreadChangeEvent>();
  private readonly defaultSpreadMode: SpreadMode;

  constructor(id: string, registry: PluginRegistry, cfg: SpreadPluginConfig) {
    super(id, registry);
    this.defaultSpreadMode = cfg.defaultSpreadMode ?? SpreadMode.None;
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

    this.logger.debug(
      'SpreadPlugin',
      'DocumentOpened',
      `Initialized spread state for document: ${documentId}`,
    );
  }

  protected override onDocumentLoaded(documentId: string): void {
    // Apply spread mode to pages after document is loaded
    const coreDoc = this.coreState.core.documents[documentId];
    if (coreDoc?.document) {
      const spreadPages = this.getSpreadPagesObjects(documentId, coreDoc.document.pages);
      this.dispatchCoreAction(setPages(documentId, spreadPages));
    }
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

      // Update core state with new spread pages
      const spreadPages = this.getSpreadPagesObjects(id, coreDoc.document.pages);
      this.dispatchCoreAction(setPages(id, spreadPages));

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

  private getSpreadPagesObjects(documentId: string, pages: PdfPageObject[]): PdfPageObject[][] {
    if (!pages.length) return [];

    const docState = this.getDocumentStateOrThrow(documentId);
    const spreadMode = docState.spreadMode;

    switch (spreadMode) {
      case SpreadMode.None:
        return pages.map((page) => [page]);

      case SpreadMode.Odd:
        return Array.from({ length: Math.ceil(pages.length / 2) }, (_, i) =>
          pages.slice(i * 2, i * 2 + 2),
        );

      case SpreadMode.Even:
        return [
          [pages[0]],
          ...Array.from({ length: Math.ceil((pages.length - 1) / 2) }, (_, i) =>
            pages.slice(1 + i * 2, 1 + i * 2 + 2),
          ),
        ];

      default:
        return pages.map((page) => [page]);
    }
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
