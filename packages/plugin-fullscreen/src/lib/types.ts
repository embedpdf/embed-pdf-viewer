import { BasePluginConfig, EventHook } from '@embedpdf/core';

export interface FullscreenState {
  isFullscreen: boolean;
}

export interface FullscreenPluginConfig extends BasePluginConfig {
  /**
   * Optional CSS selector to target a specific element for fullscreen.
   * The element will be searched within the FullscreenProvider wrapper.
   * Can be an ID (e.g., '#app'), a class (e.g., '.container'), or any CSS selector.
   * If not provided or not found, the FullscreenProvider wrapper element will be used.
   */
  targetElement?: string;
}

export interface FullscreenCapability {
  isFullscreen: () => boolean;
  enableFullscreen: () => void;
  exitFullscreen: () => void;
  toggleFullscreen: () => void;
  onRequest: EventHook<'enter' | 'exit'>;
  onStateChange: EventHook<FullscreenState>;
}
