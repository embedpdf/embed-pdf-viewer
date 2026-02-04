import { BasePlugin, createBehaviorEmitter, createEmitter, PluginRegistry } from '@embedpdf/core';
import {
  FullscreenCapability,
  FullscreenPluginConfig,
  FullscreenState,
  FullscreenRequestEvent,
} from './types';
import { FullscreenAction, setFullscreen } from './actions';

export class FullscreenPlugin extends BasePlugin<
  FullscreenPluginConfig,
  FullscreenCapability,
  FullscreenState,
  FullscreenAction
> {
  static readonly id = 'fullscreen' as const;

  private readonly onStateChange$ = createBehaviorEmitter<FullscreenState>();
  private readonly fullscreenRequest$ = createEmitter<FullscreenRequestEvent>();
  private config: FullscreenPluginConfig;
  private currentTargetElement?: string;

  constructor(id: string, registry: PluginRegistry, config: FullscreenPluginConfig) {
    super(id, registry);
    this.config = config;
  }

  async initialize(_: FullscreenPluginConfig): Promise<void> {}

  protected buildCapability(): FullscreenCapability {
    return {
      isFullscreen: () => this.state.isFullscreen,
      enableFullscreen: (targetElement?: string) => this.enableFullscreen(targetElement),
      exitFullscreen: () => this.exitFullscreen(),
      toggleFullscreen: (targetElement?: string) => this.toggleFullscreen(targetElement),
      onRequest: this.fullscreenRequest$.on,
      onStateChange: this.onStateChange$.on,
    };
  }

  public getTargetSelector(): string | undefined {
    // Return the current target (from last request) or fall back to config default
    return this.currentTargetElement ?? this.config.targetElement;
  }

  private toggleFullscreen(targetElement?: string): void {
    if (this.state.isFullscreen) {
      this.exitFullscreen();
    } else {
      this.enableFullscreen(targetElement);
    }
  }

  private enableFullscreen(targetElement?: string): void {
    // Store the target element for this request
    this.currentTargetElement = targetElement ?? this.config.targetElement;

    this.fullscreenRequest$.emit({
      action: 'enter',
      targetElement: this.currentTargetElement,
    });
  }

  private exitFullscreen(): void {
    this.fullscreenRequest$.emit({
      action: 'exit',
    });

    // Clear the current target when exiting
    this.currentTargetElement = undefined;
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
