import {
  BasePlugin,
  createBehaviorEmitter,
  createEmitter,
  PluginRegistry,
  setPages,
} from '@embedpdf/core';
import { PdfDocumentObject, PdfPageObject } from '@embedpdf/models';
import { LoaderPlugin } from '@embedpdf/plugin-loader';
import { SpreadCapability, SpreadMode, SpreadPluginConfig, SpreadState } from './types';
import { setSpreadMode } from './actions';
import { SpreadAction } from './actions';

export class SpreadPlugin extends BasePlugin<
  SpreadPluginConfig,
  SpreadCapability,
  SpreadState,
  SpreadAction
> {
  static readonly id = 'spread' as const;

  private readonly spreadEmitter$ = createBehaviorEmitter<SpreadMode>();

  constructor(id: string, registry: PluginRegistry, cfg: SpreadPluginConfig) {
    super(id, registry);
    this.resetReady();
    this.dispatch(setSpreadMode(cfg.defaultSpreadMode ?? SpreadMode.None));
    const loaderPlugin = registry.getPlugin<LoaderPlugin>('loader');
    loaderPlugin!.provides().onDocumentLoaded((document) => this.documentLoaded(document));
  }

  async initialize(config: SpreadPluginConfig): Promise<void> {
    if (config.defaultSpreadMode) {
      this.dispatch(setSpreadMode(config.defaultSpreadMode));
    }
  }

  private documentLoaded(document: PdfDocumentObject): void {
    this.dispatchCoreAction(setPages(this.getSpreadPagesObjects(document.pages)));
    this.markReady();
  }

  getSpreadPagesObjects(pages: PdfPageObject[]): PdfPageObject[][] {
    if (!pages.length) return [];

    switch (this.state.spreadMode) {
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

  setSpreadMode(mode: SpreadMode): void {
    const currentMode = this.state.spreadMode;
    const document = this.coreState.core.document;
    if (!document) {
      throw new Error('Document not loaded');
    }
    if (currentMode !== mode) {
      this.dispatch(setSpreadMode(mode));
      this.dispatchCoreAction(setPages(this.getSpreadPagesObjects(document.pages)));
      this.notifySpreadChange(mode);
    }
  }

  private notifySpreadChange(spreadMode: SpreadMode): void {
    this.spreadEmitter$.emit(spreadMode);
  }

  protected buildCapability(): SpreadCapability {
    return {
      onSpreadChange: this.spreadEmitter$.on,
      setSpreadMode: (mode) => this.setSpreadMode(mode),
      getSpreadMode: () => this.state.spreadMode,
    };
  }

  async destroy(): Promise<void> {
    this.spreadEmitter$.clear();
  }
}
