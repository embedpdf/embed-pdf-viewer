import { PluginPackage } from '@embedpdf/core';

import { AiManagerPlugin } from './ai-manager-plugin';
import { manifest, AI_MANAGER_PLUGIN_ID } from './manifest';
import { AiManagerPluginConfig, AiManagerState } from './types';
import { reducer, initialState } from './reducer';
import { AiManagerAction } from './actions';

export const AiManagerPluginPackage: PluginPackage<
  AiManagerPlugin,
  AiManagerPluginConfig,
  AiManagerState,
  AiManagerAction
> = {
  manifest,
  create: (registry, config) => new AiManagerPlugin(AI_MANAGER_PLUGIN_ID, registry, config),
  reducer,
  initialState,
};

export * from './ai-manager-plugin';
export * from './types';
export * from './manifest';
