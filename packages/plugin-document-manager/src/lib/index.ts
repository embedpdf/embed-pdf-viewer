import { PluginPackage } from '@embedpdf/core';
import { DocumentManagerPlugin } from './document-manager-plugin';
import { manifest, DOCUMENT_MANAGER_PLUGIN_ID } from './manifest';
import { DocumentManagerPluginConfig } from './types';

export const DocumentManagerPluginPackage: PluginPackage<
  DocumentManagerPlugin,
  DocumentManagerPluginConfig
> = {
  manifest,
  create: (registry, config) =>
    new DocumentManagerPlugin(DOCUMENT_MANAGER_PLUGIN_ID, registry, config),
  reducer: (state) => state,
  initialState: {},
};

export * from './document-manager-plugin';
export * from './types';
export * from './manifest';
