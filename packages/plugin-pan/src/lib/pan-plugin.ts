import { BasePlugin, createBehaviorEmitter, PluginRegistry, Unsubscribe } from '@embedpdf/core';
import {
  InteractionManagerCapability,
  InteractionManagerPlugin,
} from '@embedpdf/plugin-interaction-manager';

import { PanCapability, PanPluginConfig } from './types';
import { ViewportCapability, ViewportPlugin } from '@embedpdf/plugin-viewport';

export class PanPlugin extends BasePlugin<PanPluginConfig, PanCapability> {
  static readonly id = 'pan' as const;

  private readonly panMode$ = createBehaviorEmitter<boolean>();

  private interactionManager: InteractionManagerCapability;
  private viewport: ViewportCapability;
  public config: PanPluginConfig;

  private unregisterHandlers?: () => void;
  private unsubscribePanModeChange?: Unsubscribe;

  constructor(id: string, registry: PluginRegistry, config: PanPluginConfig) {
    super(id, registry);

    this.config = config;

    this.interactionManager = registry
      .getPlugin<InteractionManagerPlugin>(InteractionManagerPlugin.id)
      ?.provides()!;
    this.viewport = registry.getPlugin<ViewportPlugin>(ViewportPlugin.id)?.provides()!;

    if (this.interactionManager) {
      this.interactionManager.registerMode({
        id: 'panMode',
        scope: 'global',
        exclusive: false,
        cursor: 'grab',
        wantsRawTouch: false,
      });

      this.unsubscribePanModeChange = this.interactionManager.onStateChange((state) => {
        if (state.activeMode === 'panMode') {
          this.panMode$.emit(true);
        } else {
          this.panMode$.emit(false);
        }
      });

      // Register pan handlers immediately
      this.registerPanHandlers();
    }

    // Handle 'always' mode - this is safe on server side
    if (config.defaultMode === 'always') {
      this.makePanDefault(true);
    }
  }

  async initialize(_: PanPluginConfig): Promise<void> {}

  async destroy(): Promise<void> {
    this.unregisterHandlers?.();
    this.unsubscribePanModeChange?.();
    await super.destroy();
  }

  private registerPanHandlers() {
    let dragState: {
      startX: number;
      startY: number;
      startLeft: number;
      startTop: number;
    } | null = null;

    const handlers = {
      onMouseDown: (_: any, pe: MouseEvent) => {
        const metrics = this.viewport.getMetrics();

        dragState = {
          startX: pe.clientX,
          startY: pe.clientY,
          startLeft: metrics.scrollLeft,
          startTop: metrics.scrollTop,
        };

        this.interactionManager.setCursor('panMode', 'grabbing', 10);
      },
      onMouseMove: (_: any, pe: MouseEvent) => {
        if (!dragState) return;

        /* delta between current pointer position and where the drag started */
        const dx = pe.clientX - dragState.startX;
        const dy = pe.clientY - dragState.startY;

        this.viewport.scrollTo({
          x: dragState.startLeft - dx,
          y: dragState.startTop - dy,
        });
      },
      onMouseUp: () => {
        if (!dragState) return;

        dragState = null;
        this.interactionManager.removeCursor('panMode');
      },
      onMouseLeave: () => {
        if (!dragState) return;

        dragState = null;
        this.interactionManager.removeCursor('panMode');
      },
      onMouseCancel: () => {
        if (!dragState) return;

        dragState = null;
        this.interactionManager.removeCursor('panMode');
      },
    };

    this.unregisterHandlers = this.interactionManager.registerHandlers({
      modeId: 'panMode',
      handlers,
    });
  }

  private makePanDefault(autoActivate: boolean = true) {
    if (!this.interactionManager) return;

    this.interactionManager.setDefaultMode('panMode');
    if (autoActivate) {
      this.interactionManager.activateDefaultMode();
    }
  }

  protected buildCapability(): PanCapability {
    return {
      onPanModeChange: this.panMode$.on,
      makePanDefault: (autoActivate: boolean = true) => this.makePanDefault(autoActivate),
      enablePan: () => this.interactionManager?.activate('panMode'),
      disablePan: () => this.interactionManager?.activateDefaultMode(),
      togglePan: () => {
        if (this.interactionManager?.getActiveMode() === 'panMode') {
          this.interactionManager?.activateDefaultMode();
        } else {
          this.interactionManager?.activate('panMode');
        }
      },
    };
  }
}
