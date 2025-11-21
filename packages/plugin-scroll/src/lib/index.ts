import { PluginPackage } from '@embedpdf/core';
import { ScrollPlugin } from './scroll-plugin';
import { manifest, SCROLL_PLUGIN_ID } from './manifest';
import { ScrollPluginConfig, ScrollState } from './types';
import { scrollReducer, initialState } from './reducer';
import { ScrollAction } from './actions';

export const ScrollPluginPackage: PluginPackage<
  ScrollPlugin,
  ScrollPluginConfig,
  ScrollState,
  ScrollAction
> = {
  manifest,
  create: (registry, config) => new ScrollPlugin(SCROLL_PLUGIN_ID, registry, config),
  reducer: scrollReducer,
  initialState: (coreState, config) => initialState(coreState, config),
};

export * from './scroll-plugin';
export * from './types';
export * from './manifest';
export * from './types/virtual-item';
export * from './selectors';
