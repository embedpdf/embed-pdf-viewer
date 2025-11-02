import {
  BasePlugin,
  createEmitter,
  PluginRegistry,
  REFRESH_PAGES,
  Unsubscribe,
} from '@embedpdf/core';
import {
  RenderCapability,
  RenderPageOptions,
  RenderPageRectOptions,
  RenderPluginConfig,
} from './types';

export class RenderPlugin extends BasePlugin<RenderPluginConfig, RenderCapability> {
  static readonly id = 'render' as const;

  private readonly refreshPages$ = createEmitter<number[]>();
  private config: RenderPluginConfig;

  constructor(id: string, registry: PluginRegistry, config: RenderPluginConfig) {
    super(id, registry);

    this.coreStore.onAction(REFRESH_PAGES, (action) => {
      this.refreshPages$.emit(action.payload);
    });

    this.config = config;
  }

  async initialize(_config: RenderPluginConfig): Promise<void> {}

  protected buildCapability(): RenderCapability {
    return {
      renderPage: this.renderPage.bind(this),
      renderPageRect: this.renderPageRect.bind(this),
    };
  }

  public onRefreshPages(fn: (pages: number[]) => void): Unsubscribe {
    return this.refreshPages$.on(fn);
  }

  private renderPage({ pageIndex, options }: RenderPageOptions) {
    const coreState = this.coreState.core;

    if (!coreState.document) {
      throw new Error('document does not open');
    }

    const page = coreState.document.pages.find((page) => page.index === pageIndex);
    if (!page) {
      throw new Error('page does not exist');
    }

    return this.engine.renderPage(coreState.document, page, {
      ...options,
      imageType: options.imageType ?? this.config.defaultImageType ?? 'image/webp',
      imageQuality: options.imageQuality ?? this.config.defaultImageQuality ?? 0.92,
    });
  }

  private renderPageRect({ pageIndex, rect, options }: RenderPageRectOptions) {
    const coreState = this.coreState.core;

    if (!coreState.document) {
      throw new Error('document does not open');
    }

    const page = coreState.document.pages.find((page) => page.index === pageIndex);
    if (!page) {
      throw new Error('page does not exist');
    }

    return this.engine.renderPageRect(coreState.document, page, rect, {
      ...options,
      imageType: options.imageType ?? this.config.defaultImageType ?? 'image/webp',
      imageQuality: options.imageQuality ?? this.config.defaultImageQuality ?? 0.92,
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
