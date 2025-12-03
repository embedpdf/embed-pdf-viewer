import { PluginPackage } from '@embedpdf/core';
import { RenderPluginConfig } from './types';
import { RenderPlugin } from './render-plugin';
import { manifest, RENDER_PLUGIN_ID } from './manifest';

export const RenderPluginPackage: PluginPackage<RenderPlugin, RenderPluginConfig> = {
  manifest,
  create: (registry, config) => new RenderPlugin(RENDER_PLUGIN_ID, registry, config),
  reducer: () => {},
  initialState: {},
};

export * from './render-plugin';
export * from './types';
