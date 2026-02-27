import { BasePlugin, PluginRegistry } from '@embedpdf/core';
import { PdfDocumentObject, PdfPageObject, PdfRenderPageOptions } from '@embedpdf/models';
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

  private config: RenderPluginConfig;

  constructor(id: string, registry: PluginRegistry, config: RenderPluginConfig) {
    super(id, registry);
    this.config = config;
  }

  // No onDocumentLoadingStarted or onDocumentClosed needed!

  protected buildCapability(): RenderCapability {
    return {
      // Active document operations
      renderPage: (options: RenderPageOptions) => this.renderPage(options),
      renderPageRect: (options: RenderPageRectOptions) => this.renderPageRect(options),
      renderPageRaw: (options: RenderPageOptions) => this.renderPageRaw(options),
      renderPageRectRaw: (options: RenderPageRectOptions) => this.renderPageRectRaw(options),
      renderPageBitmap: (options: RenderPageOptions) => this.renderPageBitmap(options),
      renderPageRectBitmap: (options: RenderPageRectOptions) => this.renderPageRectBitmap(options),
      renderMode: this.config.renderMode ?? 'blob',

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
      renderPageRaw: (options: RenderPageOptions) => this.renderPageRaw(options, documentId),
      renderPageRectRaw: (options: RenderPageRectOptions) =>
        this.renderPageRectRaw(options, documentId),
      renderPageBitmap: (options: RenderPageOptions) => this.renderPageBitmap(options, documentId),
      renderPageRectBitmap: (options: RenderPageRectOptions) =>
        this.renderPageRectBitmap(options, documentId),
      renderMode: this.config.renderMode ?? 'blob',
    };
  }

  // ─────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────

  private resolveDocAndPage(
    pageIndex: number,
    documentId?: string,
  ): { doc: PdfDocumentObject; page: PdfPageObject } {
    const id = documentId ?? this.getActiveDocumentId();
    const coreDoc = this.coreState.core.documents[id];

    if (!coreDoc?.document) {
      throw new Error(`Document ${id} not loaded`);
    }

    const page = coreDoc.document.pages.find((p) => p.index === pageIndex);
    if (!page) {
      throw new Error(`Page ${pageIndex} not found in document ${id}`);
    }

    return { doc: coreDoc.document, page };
  }

  private mergeImageOptions(options?: PdfRenderPageOptions): PdfRenderPageOptions {
    return {
      ...(options ?? {}),
      withForms: options?.withForms ?? this.config.withForms ?? false,
      withAnnotations: options?.withAnnotations ?? this.config.withAnnotations ?? false,
      imageType: options?.imageType ?? this.config.defaultImageType ?? 'image/png',
      imageQuality: options?.imageQuality ?? this.config.defaultImageQuality ?? 0.92,
    };
  }

  private mergeRawOptions(options?: PdfRenderPageOptions): PdfRenderPageOptions {
    return {
      ...(options ?? {}),
      withForms: options?.withForms ?? this.config.withForms ?? false,
      withAnnotations: options?.withAnnotations ?? this.config.withAnnotations ?? false,
    };
  }

  // ─────────────────────────────────────────────────────────
  // Core Operations
  // ─────────────────────────────────────────────────────────

  private renderPage({ pageIndex, options }: RenderPageOptions, documentId?: string) {
    const { doc, page } = this.resolveDocAndPage(pageIndex, documentId);
    return this.engine.renderPage(doc, page, this.mergeImageOptions(options));
  }

  private renderPageRect({ pageIndex, rect, options }: RenderPageRectOptions, documentId?: string) {
    const { doc, page } = this.resolveDocAndPage(pageIndex, documentId);
    return this.engine.renderPageRect(doc, page, rect, this.mergeImageOptions(options));
  }

  // ─────────────────────────────────────────────────────────
  // Raw Rendering (returns ImageDataLike, skips encoding)
  // ─────────────────────────────────────────────────────────

  private renderPageRaw({ pageIndex, options }: RenderPageOptions, documentId?: string) {
    const { doc, page } = this.resolveDocAndPage(pageIndex, documentId);
    return this.engine.renderPageRaw(doc, page, this.mergeRawOptions(options));
  }

  private renderPageRectRaw(
    { pageIndex, rect, options }: RenderPageRectOptions,
    documentId?: string,
  ) {
    const { doc, page } = this.resolveDocAndPage(pageIndex, documentId);
    return this.engine.renderPageRectRaw(doc, page, rect, this.mergeRawOptions(options));
  }

  // ─────────────────────────────────────────────────────────
  // Bitmap Rendering (raw → createImageBitmap on main thread)
  // ─────────────────────────────────────────────────────────

  private renderPageBitmap({ pageIndex, options }: RenderPageOptions, documentId?: string) {
    const { doc, page } = this.resolveDocAndPage(pageIndex, documentId);
    return this.engine
      .renderPageRaw(doc, page, {
        ...this.mergeRawOptions(options),
        priority: 3,
      })
      .map(async (raw) => {
        const sizeLabel = `${raw.width}x${raw.height}`;
        this.logger.perf('RenderPlugin', 'createImageBitmap', 'call', 'Begin', sizeLabel);
        const bmp = await createImageBitmap(new ImageData(raw.data, raw.width, raw.height));
        this.logger.perf('RenderPlugin', 'createImageBitmap', 'call', 'End', sizeLabel);
        return bmp;
      });
  }

  private renderPageRectBitmap(
    { pageIndex, rect, options }: RenderPageRectOptions,
    documentId?: string,
  ) {
    const { doc, page } = this.resolveDocAndPage(pageIndex, documentId);
    return this.engine
      .renderPageRectRaw(doc, page, rect, this.mergeRawOptions(options))
      .map(async (raw) => {
        const sizeLabel = `${raw.width}x${raw.height}`;
        this.logger.perf('RenderPlugin', 'createImageBitmap', 'call', 'Begin', sizeLabel);
        const bmp = await createImageBitmap(new ImageData(raw.data, raw.width, raw.height));
        this.logger.perf('RenderPlugin', 'createImageBitmap', 'call', 'End', sizeLabel);
        return bmp;
      });
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
