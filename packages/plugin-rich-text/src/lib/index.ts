import { PluginPackage } from '@embedpdf/core';
import { RichTextPlugin } from './rich-text-plugin';
import { RICH_TEXT_PLUGIN_ID, manifest } from './manifest';
import { RichTextPluginConfig } from './types';

export const RichTextPluginPackage: PluginPackage<RichTextPlugin, RichTextPluginConfig> = {
  manifest,
  create: (registry, engine, config) =>
    new RichTextPlugin(RICH_TEXT_PLUGIN_ID, registry, engine, config),
  reducer: () => {},
  initialState: {},
};

export * from './rich-text-plugin';
export * from './types';
export * from './manifest';
