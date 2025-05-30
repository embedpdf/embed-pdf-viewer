import { PluginPackage } from '@embedpdf/core';
import { LoaderPlugin } from './loader-plugin';
import { LOADER_PLUGIN_ID, manifest } from './manifest';
import { LoaderPluginConfig } from './types';

export const LoaderPluginPackage: PluginPackage<LoaderPlugin, LoaderPluginConfig> = {
  manifest,
  create: (registry, engine) => new LoaderPlugin(LOADER_PLUGIN_ID, registry, engine),
  reducer: () => {},
  initialState: {},
};

export * from './loader-plugin';
export * from './types';
export * from './manifest';
