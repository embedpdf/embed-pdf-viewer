import { BasePlugin, createBehaviorEmitter, createEmitter, PluginRegistry } from '@embedpdf/core';
import { FullscreenCapability, FullscreenPluginConfig, FullscreenState } from './types';
import { FullscreenAction, setFullscreen } from './actions';

export class FullscreenPlugin extends BasePlugin<
  FullscreenPluginConfig,
  FullscreenCapability,
  FullscreenState,
  FullscreenAction
> {
  static readonly id = 'fullscreen' as const;

  private readonly onStateChange$ = createBehaviorEmitter<FullscreenState>();
  private readonly fullscreenRequest$ = createEmitter<'enter' | 'exit'>();
  private config: FullscreenPluginConfig;

  constructor(id: string, registry: PluginRegistry, config: FullscreenPluginConfig) {
    super(id, registry);
    this.config = config;
  }

  async initialize(_: FullscreenPluginConfig): Promise<void> {}

  protected buildCapability(): FullscreenCapability {
    return {
      isFullscreen: () => this.state.isFullscreen,
      enableFullscreen: () => this.enableFullscreen(),
      exitFullscreen: () => this.exitFullscreen(),
      toggleFullscreen: () => this.toggleFullscreen(),
      onRequest: this.fullscreenRequest$.on,
      onStateChange: this.onStateChange$.on,
    };
  }

  public getTargetSelector(): string | undefined {
    return this.config.targetElement;
  }

  private toggleFullscreen(): void {
    if (this.state.isFullscreen) {
      this.exitFullscreen();
    } else {
      this.enableFullscreen();
    }
  }

  private enableFullscreen(): void {
    this.fullscreenRequest$.emit('enter');
  }

  private exitFullscreen(): void {
    this.fullscreenRequest$.emit('exit');
  }

  override onStoreUpdated(_: FullscreenState, newState: FullscreenState): void {
    this.onStateChange$.emit(newState);
  }

  public setFullscreenState(isFullscreen: boolean): void {
    this.dispatch(setFullscreen(isFullscreen));
  }

  async destroy(): Promise<void> {
    this.fullscreenRequest$.clear();
    super.destroy();
  }
}
