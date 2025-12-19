import {
  BasePlugin,
  createBehaviorEmitter,
  createEmitter,
  PluginRegistry,
  Listener,
} from '@embedpdf/core';
import { ignore, Rect } from '@embedpdf/models';
import {
  InteractionManagerCapability,
  InteractionManagerPlugin,
} from '@embedpdf/plugin-interaction-manager';
import { RenderCapability, RenderPlugin } from '@embedpdf/plugin-render';

import {
  CaptureAreaEvent,
  CaptureCapability,
  CapturePluginConfig,
  RegisterMarqueeOnPageOptions,
  CaptureState,
  CaptureScope,
  StateChangeEvent,
  CaptureDocumentState,
} from './types';
import { createMarqueeHandler } from './handlers';
import {
  CaptureAction,
  initCaptureState,
  cleanupCaptureState,
  setMarqueeCaptureActive,
} from './actions';
import { initialDocumentState } from './reducer';

export class CapturePlugin extends BasePlugin<
  CapturePluginConfig,
  CaptureCapability,
  CaptureState,
  CaptureAction
> {
  static readonly id = 'capture' as const;

  private captureArea$ = createEmitter<CaptureAreaEvent>();
  private state$ = createBehaviorEmitter<StateChangeEvent>();

  private renderCapability: RenderCapability;
  private interactionManagerCapability: InteractionManagerCapability | undefined;
  private config: CapturePluginConfig;

  constructor(id: string, registry: PluginRegistry, config: CapturePluginConfig) {
    super(id, registry);

    this.config = config;

    this.renderCapability = this.registry.getPlugin<RenderPlugin>('render')!.provides();
    this.interactionManagerCapability = this.registry
      .getPlugin<InteractionManagerPlugin>('interaction-manager')
      ?.provides();

    if (this.interactionManagerCapability) {
      this.interactionManagerCapability.registerMode({
        id: 'marqueeCapture',
        scope: 'page',
        exclusive: true,
        cursor: 'crosshair',
      });

      this.interactionManagerCapability.onModeChange((state) => {
        // Track marquee capture state changes for this document
        const isMarqueeActive = state.activeMode === 'marqueeCapture';
        const docState = this.getDocumentState(state.documentId);

        // Only dispatch if state actually changed
        if (docState && docState.isMarqueeCaptureActive !== isMarqueeActive) {
          this.dispatch(setMarqueeCaptureActive(state.documentId, isMarqueeActive));
        }
      });
    }
  }

  // ─────────────────────────────────────────────────────────
  // Document Lifecycle (from BasePlugin)
  // ─────────────────────────────────────────────────────────

  protected override onDocumentLoadingStarted(documentId: string): void {
    // Initialize capture state for this document
    const docState: CaptureDocumentState = {
      ...initialDocumentState,
    };

    this.dispatch(initCaptureState(documentId, docState));

    this.logger.debug(
      'CapturePlugin',
      'DocumentOpened',
      `Initialized capture state for document: ${documentId}`,
    );
  }

  protected override onDocumentClosed(documentId: string): void {
    this.dispatch(cleanupCaptureState(documentId));

    this.logger.debug(
      'CapturePlugin',
      'DocumentClosed',
      `Cleaned up capture state for document: ${documentId}`,
    );
  }

  // ─────────────────────────────────────────────────────────
  // Capability
  // ─────────────────────────────────────────────────────────

  async initialize(_: CapturePluginConfig): Promise<void> {}

  protected buildCapability(): CaptureCapability {
    return {
      // Active document operations
      captureArea: (pageIndex, rect) => this.captureArea(pageIndex, rect),
      enableMarqueeCapture: () => this.enableMarqueeCapture(),
      disableMarqueeCapture: () => this.disableMarqueeCapture(),
      toggleMarqueeCapture: () => this.toggleMarqueeCapture(),
      isMarqueeCaptureActive: () => this.isMarqueeCaptureActive(),
      getState: () => this.getDocumentStateOrThrow(),

      // Document-scoped operations
      forDocument: (documentId: string) => this.createCaptureScope(documentId),

      // Global
      registerMarqueeOnPage: (opts) => this.registerMarqueeOnPage(opts),

      // Events
      onCaptureArea: this.captureArea$.on,
      onStateChange: this.state$.on,
    };
  }

  // ─────────────────────────────────────────────────────────
  // Document Scoping
  // ─────────────────────────────────────────────────────────

  private createCaptureScope(documentId: string): CaptureScope {
    return {
      captureArea: (pageIndex, rect) => this.captureArea(pageIndex, rect, documentId),
      enableMarqueeCapture: () => this.enableMarqueeCapture(documentId),
      disableMarqueeCapture: () => this.disableMarqueeCapture(documentId),
      toggleMarqueeCapture: () => this.toggleMarqueeCapture(documentId),
      isMarqueeCaptureActive: () => this.isMarqueeCaptureActive(documentId),
      getState: () => this.getDocumentStateOrThrow(documentId),
      onCaptureArea: (listener: Listener<CaptureAreaEvent>) =>
        this.captureArea$.on((event) => {
          if (event.documentId === documentId) listener(event);
        }),
      onStateChange: (listener: Listener<CaptureDocumentState>) =>
        this.state$.on((event) => {
          if (event.documentId === documentId) listener(event.state);
        }),
    };
  }

  // ─────────────────────────────────────────────────────────
  // State Helpers
  // ─────────────────────────────────────────────────────────

  private getDocumentState(documentId?: string): CaptureDocumentState | null {
    const id = documentId ?? this.getActiveDocumentId();
    return this.state.documents[id] ?? null;
  }

  private getDocumentStateOrThrow(documentId?: string): CaptureDocumentState {
    const state = this.getDocumentState(documentId);
    if (!state) {
      throw new Error(`Capture state not found for document: ${documentId ?? 'active'}`);
    }
    return state;
  }

  // ─────────────────────────────────────────────────────────
  // Per-Document Operations
  // ─────────────────────────────────────────────────────────

  public registerMarqueeOnPage(opts: RegisterMarqueeOnPageOptions) {
    if (!this.interactionManagerCapability) {
      this.logger.warn(
        'CapturePlugin',
        'MissingDependency',
        'Interaction manager plugin not loaded, marquee capture disabled',
      );
      return () => {};
    }

    const coreDoc = this.coreState.core.documents[opts.documentId];
    if (!coreDoc || !coreDoc.document) {
      this.logger.warn('CapturePlugin', 'DocumentNotFound', 'Document not found');
      return () => {};
    }

    const page = coreDoc.document.pages[opts.pageIndex];
    if (!page) {
      this.logger.warn('CapturePlugin', 'PageNotFound', `Page ${opts.pageIndex} not found`);
      return () => {};
    }

    const handlers = createMarqueeHandler({
      pageSize: page.size,
      scale: opts.scale,
      onPreview: opts.callback.onPreview,
      onCommit: (rect) => {
        // Capture the selected area
        this.captureArea(opts.pageIndex, rect, opts.documentId);
        opts.callback.onCommit?.(rect);
      },
    });

    const off = this.interactionManagerCapability.registerHandlers({
      documentId: opts.documentId,
      modeId: 'marqueeCapture',
      handlers,
      pageIndex: opts.pageIndex,
    });

    return off;
  }

  private captureArea(pageIndex: number, rect: Rect, documentId?: string) {
    const id = documentId ?? this.getActiveDocumentId();
    this.disableMarqueeCapture(id);

    const task = this.renderCapability.forDocument(id).renderPageRect({
      pageIndex,
      rect,
      options: {
        imageType: this.config.imageType,
        scaleFactor: this.config.scale,
        withAnnotations: this.config.withAnnotations || false,
      },
    });

    task.wait((blob) => {
      this.captureArea$.emit({
        documentId: id,
        pageIndex,
        rect,
        blob,
        imageType: this.config.imageType || 'image/png',
        scale: this.config.scale || 1,
        withAnnotations: this.config.withAnnotations || false,
      });
    }, ignore);
  }

  private enableMarqueeCapture(documentId?: string) {
    const id = documentId ?? this.getActiveDocumentId();
    this.interactionManagerCapability?.forDocument(id).activate('marqueeCapture');
  }

  private disableMarqueeCapture(documentId?: string) {
    const id = documentId ?? this.getActiveDocumentId();
    this.interactionManagerCapability?.forDocument(id).activateDefaultMode();
  }

  private toggleMarqueeCapture(documentId?: string) {
    const id = documentId ?? this.getActiveDocumentId();
    const scope = this.interactionManagerCapability?.forDocument(id);
    if (scope?.getActiveMode() === 'marqueeCapture') {
      scope.activateDefaultMode();
    } else {
      scope?.activate('marqueeCapture');
    }
  }

  private isMarqueeCaptureActive(documentId?: string): boolean {
    const id = documentId ?? this.getActiveDocumentId();
    return this.interactionManagerCapability?.forDocument(id).getActiveMode() === 'marqueeCapture';
  }

  // ─────────────────────────────────────────────────────────
  // Store Update Handlers
  // ─────────────────────────────────────────────────────────

  override onStoreUpdated(prevState: CaptureState, newState: CaptureState): void {
    // Emit state changes for each changed document
    for (const documentId in newState.documents) {
      const prevDoc = prevState.documents[documentId];
      const newDoc = newState.documents[documentId];

      if (prevDoc && newDoc && prevDoc.isMarqueeCaptureActive !== newDoc.isMarqueeCaptureActive) {
        this.state$.emit({
          documentId,
          state: newDoc,
        });
      }
    }
  }

  // ─────────────────────────────────────────────────────────
  // Lifecycle
  // ─────────────────────────────────────────────────────────

  async destroy() {
    this.captureArea$.clear();
    this.state$.clear();
    super.destroy();
  }
}
