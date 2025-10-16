import { BasePlugin, createBehaviorEmitter, Listener, PluginRegistry } from '@embedpdf/core';
import {
  InteractionManagerCapability,
  InteractionManagerPlugin,
} from '@embedpdf/plugin-interaction-manager';
import { ViewportCapability, ViewportPlugin } from '@embedpdf/plugin-viewport';

import {
  PanCapability,
  PanPluginConfig,
  PanScope,
  PanModeChangeEvent,
  PanState,
  PanDocumentState,
} from './types';
import { initPanState, cleanupPanState, setPanMode, PanAction } from './actions';

export class PanPlugin extends BasePlugin<PanPluginConfig, PanCapability, PanState, PanAction> {
  static readonly id = 'pan' as const;

  private readonly panMode$ = createBehaviorEmitter<PanModeChangeEvent>();

  private interactionManager: InteractionManagerCapability;
  private viewport: ViewportCapability;
  public config: PanPluginConfig;

  // Track handler cleanup functions per document
  private documentHandlers = new Map<string, () => void>();

  constructor(id: string, registry: PluginRegistry, config: PanPluginConfig) {
    super(id, registry);

    this.config = config;

    this.interactionManager = registry
      .getPlugin<InteractionManagerPlugin>(InteractionManagerPlugin.id)
      ?.provides()!;
    this.viewport = registry.getPlugin<ViewportPlugin>(ViewportPlugin.id)?.provides()!;

    if (this.interactionManager) {
      // Register pan mode globally (mode definition is global)
      this.interactionManager.registerMode({
        id: 'panMode',
        scope: 'global',
        exclusive: false,
        cursor: 'grab',
        wantsRawTouch: false,
      });

      this.interactionManager?.onModeChange((state) => {
        // Track pan mode state changes for this document
        const isPanMode = state.activeMode === 'panMode';
        const docState = this.getDocumentState(state.documentId);

        // Only dispatch if state actually changed
        if (docState && docState.isPanMode !== isPanMode) {
          this.dispatch(setPanMode(state.documentId, isPanMode));
        }
      });
    }
  }

  // ─────────────────────────────────────────────────────────
  // Document Lifecycle Hooks (from BasePlugin)
  // ─────────────────────────────────────────────────────────

  protected override onDocumentLoadingStarted(documentId: string): void {
    // Initialize pan state for this document
    const docState: PanDocumentState = {
      isPanMode: false,
    };

    this.dispatch(initPanState(documentId, docState));

    // Register pan handlers for this document
    this.registerPanHandlersForDocument(documentId);

    // Handle 'always' mode
    if (this.config.defaultMode === 'always') {
      this.makePanDefault(true);
    }

    this.logger.debug(
      'PanPlugin',
      'DocumentOpened',
      `Initialized pan state for document: ${documentId}`,
    );
  }

  protected override onDocumentClosed(documentId: string): void {
    // Cleanup handlers
    const cleanup = this.documentHandlers.get(documentId);
    if (cleanup) {
      cleanup();
      this.documentHandlers.delete(documentId);
    }

    // Cleanup state
    this.dispatch(cleanupPanState(documentId));

    this.logger.debug(
      'PanPlugin',
      'DocumentClosed',
      `Cleaned up pan state for document: ${documentId}`,
    );
  }

  // ─────────────────────────────────────────────────────────
  // Capability
  // ─────────────────────────────────────────────────────────

  protected buildCapability(): PanCapability {
    return {
      // Active document operations
      enablePan: () => this.enablePan(),
      disablePan: () => this.disablePan(),
      togglePan: () => this.togglePan(),
      makePanDefault: (autoActivate?: boolean) => this.makePanDefault(autoActivate),
      isPanMode: () => this.isPanMode(),

      // Document-scoped operations
      forDocument: (documentId: string) => this.createPanScope(documentId),

      // Events
      onPanModeChange: this.panMode$.on,
    };
  }

  // ─────────────────────────────────────────────────────────
  // Document Scoping
  // ─────────────────────────────────────────────────────────

  private createPanScope(documentId: string): PanScope {
    return {
      enablePan: () => this.enablePan(documentId),
      disablePan: () => this.disablePan(documentId),
      togglePan: () => this.togglePan(documentId),
      isPanMode: () => this.isPanMode(documentId),
      onPanModeChange: (listener: Listener<boolean>) =>
        this.panMode$.on((event) => {
          if (event.documentId === documentId) listener(event.isPanMode);
        }),
    };
  }

  // ─────────────────────────────────────────────────────────
  // State Helpers
  // ─────────────────────────────────────────────────────────
  private getDocumentState(documentId?: string): PanDocumentState | null {
    const id = documentId ?? this.getActiveDocumentId();
    return this.state.documents[id] ?? null;
  }

  private getDocumentStateOrThrow(documentId?: string): PanDocumentState {
    const state = this.getDocumentState(documentId);
    if (!state) {
      throw new Error(`Pan state not found for document: ${documentId ?? 'active'}`);
    }
    return state;
  }

  // ─────────────────────────────────────────────────────────
  // Core Operations
  // ─────────────────────────────────────────────────────────

  private enablePan(documentId?: string): void {
    const id = documentId ?? this.getActiveDocumentId();
    this.interactionManager.forDocument(id).activate('panMode');
  }

  private disablePan(documentId?: string): void {
    const id = documentId ?? this.getActiveDocumentId();
    this.interactionManager.forDocument(id).activateDefaultMode();
  }

  private togglePan(documentId?: string): void {
    const id = documentId ?? this.getActiveDocumentId();
    const scope = this.interactionManager.forDocument(id);
    if (scope.getActiveMode() === 'panMode') {
      scope.activateDefaultMode();
    } else {
      scope.activate('panMode');
    }
  }

  private makePanDefault(autoActivate: boolean = true): void {
    if (!this.interactionManager) return;

    this.interactionManager.setDefaultMode('panMode');
    if (autoActivate) {
      this.interactionManager.activateDefaultMode();
    }
  }

  private isPanMode(documentId?: string): boolean {
    return this.getDocumentStateOrThrow(documentId).isPanMode;
  }

  // ─────────────────────────────────────────────────────────
  // Pan Handlers Registration
  // ─────────────────────────────────────────────────────────

  private registerPanHandlersForDocument(documentId: string) {
    if (!this.interactionManager || !this.viewport) return;

    let dragState: {
      startX: number;
      startY: number;
      startLeft: number;
      startTop: number;
    } | null = null;

    const interactionScope = this.interactionManager.forDocument(documentId);
    const viewportScope = this.viewport.forDocument(documentId);

    const handlers = {
      onMouseDown: (_: any, pe: MouseEvent) => {
        const metrics = viewportScope.getMetrics();

        dragState = {
          startX: pe.clientX,
          startY: pe.clientY,
          startLeft: metrics.scrollLeft,
          startTop: metrics.scrollTop,
        };

        interactionScope.setCursor('panMode', 'grabbing', 10);
      },
      onMouseMove: (_: any, pe: MouseEvent) => {
        if (!dragState) return;

        /* delta between current pointer position and where the drag started */
        const dx = pe.clientX - dragState.startX;
        const dy = pe.clientY - dragState.startY;

        viewportScope.scrollTo({
          x: dragState.startLeft - dx,
          y: dragState.startTop - dy,
        });
      },
      onMouseUp: () => {
        if (!dragState) return;

        dragState = null;
        interactionScope.removeCursor('panMode');
      },
      onMouseLeave: () => {
        if (!dragState) return;

        dragState = null;
        interactionScope.removeCursor('panMode');
      },
      onMouseCancel: () => {
        if (!dragState) return;

        dragState = null;
        interactionScope.removeCursor('panMode');
      },
    };

    const unregister = this.interactionManager.registerHandlers({
      documentId,
      modeId: 'panMode',
      handlers,
    });

    this.documentHandlers.set(documentId, unregister);
  }

  // ─────────────────────────────────────────────────────────
  // Store Update Handlers
  // ─────────────────────────────────────────────────────────

  override onStoreUpdated(prevState: PanState, newState: PanState): void {
    // Emit pan mode change events for each changed document
    for (const documentId in newState.documents) {
      const prevDoc = prevState.documents[documentId];
      const newDoc = newState.documents[documentId];

      if (prevDoc?.isPanMode !== newDoc.isPanMode) {
        this.panMode$.emit({
          documentId,
          isPanMode: newDoc.isPanMode,
        });

        this.logger.debug(
          'PanPlugin',
          'PanModeChanged',
          `Pan mode changed for document ${documentId}: ${prevDoc?.isPanMode ?? false} -> ${newDoc.isPanMode}`,
        );
      }
    }
  }

  // ─────────────────────────────────────────────────────────
  // Lifecycle
  // ─────────────────────────────────────────────────────────

  async initialize(_: PanPluginConfig): Promise<void> {
    this.logger.info('PanPlugin', 'Initialize', 'Pan plugin initialized');
  }

  async destroy(): Promise<void> {
    // Cleanup all document handlers
    this.documentHandlers.forEach((cleanup) => cleanup());
    this.documentHandlers.clear();

    this.panMode$.clear();
    await super.destroy();
  }
}
