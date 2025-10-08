import { BasePlugin, createBehaviorEmitter, createEmitter, PluginRegistry } from '@embedpdf/core';
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
} from './types';
import { createMarqueeHandler } from './handlers';

export class CapturePlugin extends BasePlugin<CapturePluginConfig, CaptureCapability> {
  static readonly id = 'capture' as const;

  private captureArea$ = createEmitter<CaptureAreaEvent>();
  private marqueeCaptureActive$ = createBehaviorEmitter<boolean>();

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
        if (state.activeMode === 'marqueeCapture') {
          this.marqueeCaptureActive$.emit(true);
        } else {
          this.marqueeCaptureActive$.emit(false);
        }
      });
    }
  }

  async initialize(_: CapturePluginConfig): Promise<void> {}

  protected buildCapability(): CaptureCapability {
    return {
      onCaptureArea: this.captureArea$.on,
      onMarqueeCaptureActiveChange: this.marqueeCaptureActive$.on,
      captureArea: this.captureArea.bind(this),
      enableMarqueeCapture: this.enableMarqueeCapture.bind(this),
      disableMarqueeCapture: this.disableMarqueeCapture.bind(this),
      toggleMarqueeCapture: this.toggleMarqueeCapture.bind(this),
      isMarqueeCaptureActive: () =>
        this.interactionManagerCapability?.getActiveMode() === 'marqueeCapture',
      registerMarqueeOnPage: (opts) => this.registerMarqueeOnPage(opts),
    };
  }

  public registerMarqueeOnPage(opts: RegisterMarqueeOnPageOptions) {
    if (!this.interactionManagerCapability) {
      this.logger.warn(
        'CapturePlugin',
        'MissingDependency',
        'Interaction manager plugin not loaded, marquee capture disabled',
      );
      return () => {};
    }

    const document = this.coreState.core.document;
    if (!document) {
      this.logger.warn('CapturePlugin', 'DocumentNotFound', 'Document not found');
      return () => {};
    }

    const page = document.pages[opts.pageIndex];
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
        this.captureArea(opts.pageIndex, rect);
        opts.callback.onCommit?.(rect);
      },
    });

    const off = this.interactionManagerCapability.registerHandlers({
      modeId: 'marqueeCapture',
      handlers,
      pageIndex: opts.pageIndex,
    });

    return off;
  }

  private captureArea(pageIndex: number, rect: Rect) {
    this.disableMarqueeCapture();

    const task = this.renderCapability.renderPageRect({
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
        pageIndex,
        rect,
        blob,
        imageType: this.config.imageType || 'image/png',
        scale: this.config.scale || 1,
        withAnnotations: this.config.withAnnotations || false,
      });
    }, ignore);
  }

  private enableMarqueeCapture() {
    this.interactionManagerCapability?.activate('marqueeCapture');
  }

  private disableMarqueeCapture() {
    this.interactionManagerCapability?.activateDefaultMode();
  }

  private toggleMarqueeCapture() {
    if (this.interactionManagerCapability?.getActiveMode() === 'marqueeCapture') {
      this.interactionManagerCapability?.activateDefaultMode();
    } else {
      this.interactionManagerCapability?.activate('marqueeCapture');
    }
  }
}
