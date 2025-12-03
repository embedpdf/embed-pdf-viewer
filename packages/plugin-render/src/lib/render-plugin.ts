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
  private withForms = false;
  private withAnnotations = false;

  constructor(id: string, registry: PluginRegistry) {
    super(id, registry);

    this.coreStore.onAction(REFRESH_PAGES, (action) => {
      this.refreshPages$.emit(action.payload);
    });
  }

  async initialize(config: RenderPluginConfig): Promise<void> {
    this.withForms = config.withForms ?? false;
    this.withAnnotations = config.withAnnotations ?? false;
  }

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

    const mergedOptions = {
      ...(options ?? {}),
      withForms: options?.withForms ?? this.withForms,
      withAnnotations: options?.withAnnotations ?? this.withAnnotations,
    };

    return this.engine.renderPage(coreState.document, page, mergedOptions);
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

    const mergedOptions = {
      ...(options ?? {}),
      withForms: options?.withForms ?? this.withForms,
      withAnnotations: options?.withAnnotations ?? this.withAnnotations,
    };

    return this.engine.renderPageRect(coreState.document, page, rect, mergedOptions);
  }
}
