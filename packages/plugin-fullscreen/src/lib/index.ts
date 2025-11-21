import { PluginPackage } from '@embedpdf/core';
import { manifest, FULLSCREEN_PLUGIN_ID } from './manifest';
import { FullscreenPluginConfig, FullscreenState } from './types';
import { FullscreenPlugin } from './fullscreen-plugin';
import { initialState } from './reducer';
import { reducer } from './reducer';
import { FullscreenAction } from './actions';

export const FullscreenPluginPackage: PluginPackage<
  FullscreenPlugin,
  FullscreenPluginConfig,
  FullscreenState,
  FullscreenAction
> = {
  manifest,
  create: (registry, config) => new FullscreenPlugin(FULLSCREEN_PLUGIN_ID, registry, config),
  reducer,
  initialState,
};

export * from './fullscreen-plugin';
export * from './types';
export * from './manifest';
export * from './actions';
export { initialState };
