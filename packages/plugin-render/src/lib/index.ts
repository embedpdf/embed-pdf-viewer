import { PluginPackage } from '@embedpdf/core';
import { RenderPluginConfig } from './types';
import { RenderPlugin } from './render-plugin';
import { manifest, RENDER_PLUGIN_ID } from './manifest';

export const RenderPluginPackage: PluginPackage<RenderPlugin, RenderPluginConfig> = {
  manifest,
  create: (registry, engine) => new RenderPlugin(RENDER_PLUGIN_ID, registry, engine),
  reducer: () => {},
  initialState: {},
};

export * from './render-plugin';
export * from './types';
