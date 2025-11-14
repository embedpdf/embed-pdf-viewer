import { PluginPackage } from '@embedpdf/core';
import { DocumentManagerPlugin } from './document-manager-plugin';
import { manifest, DOCUMENT_MANAGER_PLUGIN_ID } from './manifest';
import { DocumentManagerPluginConfig, DocumentManagerState } from './types';
import { documentManagerReducer, initialState } from './reducer';
import { DocumentManagerAction } from './actions';

export const DocumentManagerPluginPackage: PluginPackage<
  DocumentManagerPlugin,
  DocumentManagerPluginConfig,
  DocumentManagerState,
  DocumentManagerAction
> = {
  manifest,
  create: (registry, config) =>
    new DocumentManagerPlugin(DOCUMENT_MANAGER_PLUGIN_ID, registry, config),
  reducer: documentManagerReducer,
  initialState,
};

export * from './document-manager-plugin';
export * from './types';
export * from './manifest';
export * from './actions';
