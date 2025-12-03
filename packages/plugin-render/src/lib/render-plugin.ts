import { BasePlugin, PluginRegistry } from '@embedpdf/core';
import {
  RenderCapability,
  RenderPageOptions,
  RenderPageRectOptions,
  RenderPluginConfig,
  RenderScope,
} from './types';

/**
 * Render Plugin - Simplified version that relies on core state for refresh tracking
 *
 * Key insight: Page refresh tracking is in DocumentState.pageRefreshVersions
 * This allows ANY plugin to observe page refreshes, not just the render plugin.
 */
export class RenderPlugin extends BasePlugin<RenderPluginConfig, RenderCapability> {
  static readonly id = 'render' as const;

  private withForms = false;
  private withAnnotations = false;

  constructor(id: string, registry: PluginRegistry, config?: RenderPluginConfig) {
    super(id, registry);

    this.withForms = config?.withForms ?? false;
    this.withAnnotations = config?.withAnnotations ?? false;
  }

  // No onDocumentLoadingStarted or onDocumentClosed needed!

  protected buildCapability(): RenderCapability {
    return {
      // Active document operations
      renderPage: (options: RenderPageOptions) => this.renderPage(options),
      renderPageRect: (options: RenderPageRectOptions) => this.renderPageRect(options),

      // Document-scoped operations
      forDocument: (documentId: string) => this.createRenderScope(documentId),
    };
  }

  // ─────────────────────────────────────────────────────────
  // Document Scoping
  // ─────────────────────────────────────────────────────────

  private createRenderScope(documentId: string): RenderScope {
    return {
      renderPage: (options: RenderPageOptions) => this.renderPage(options, documentId),
      renderPageRect: (options: RenderPageRectOptions) => this.renderPageRect(options, documentId),
    };
  }

  // ─────────────────────────────────────────────────────────
  // Core Operations
  // ─────────────────────────────────────────────────────────

  private renderPage({ pageIndex, options }: RenderPageOptions, documentId?: string) {
    const id = documentId ?? this.getActiveDocumentId();
    const coreDoc = this.coreState.core.documents[id];

    if (!coreDoc?.document) {
      throw new Error(`Document ${id} not loaded`);
    }

    const page = coreDoc.document.pages.find((p) => p.index === pageIndex);
    if (!page) {
      throw new Error(`Page ${pageIndex} not found in document ${id}`);
    }

    const mergedOptions = {
      ...(options ?? {}),
      withForms: options?.withForms ?? this.withForms,
      withAnnotations: options?.withAnnotations ?? this.withAnnotations,
    };

    return this.engine.renderPage(coreDoc.document, page, mergedOptions);
  }

  private renderPageRect({ pageIndex, rect, options }: RenderPageRectOptions, documentId?: string) {
    const id = documentId ?? this.getActiveDocumentId();
    const coreDoc = this.coreState.core.documents[id];

    if (!coreDoc?.document) {
      throw new Error(`Document ${id} not loaded`);
    }

    const page = coreDoc.document.pages.find((p) => p.index === pageIndex);
    if (!page) {
      throw new Error(`Page ${pageIndex} not found in document ${id}`);
    }

    const mergedOptions = {
      ...(options ?? {}),
      withForms: options?.withForms ?? this.withForms,
      withAnnotations: options?.withAnnotations ?? this.withAnnotations,
    };

    return this.engine.renderPageRect(coreDoc.document, page, rect, mergedOptions);
  }

  // ─────────────────────────────────────────────────────────
  // Lifecycle
  // ─────────────────────────────────────────────────────────

  async initialize(_config: RenderPluginConfig): Promise<void> {
    this.logger.info('RenderPlugin', 'Initialize', 'Render plugin initialized');
  }

  async destroy(): Promise<void> {
    super.destroy();
  }
}
