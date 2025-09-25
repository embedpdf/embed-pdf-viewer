import { PluginPackage } from '@embedpdf/core';

import { InteractionManagerPlugin } from './interaction-manager-plugin';
import { manifest, INTERACTION_MANAGER_PLUGIN_ID } from './manifest';
import { InteractionManagerPluginConfig, InteractionManagerState } from './types';
import { reducer, initialState } from './reducer';
import { InteractionManagerAction } from './actions';

export const InteractionManagerPluginPackage: PluginPackage<
  InteractionManagerPlugin,
  InteractionManagerPluginConfig,
  InteractionManagerState,
  InteractionManagerAction
> = {
  manifest,
  create: (registry, config) =>
    new InteractionManagerPlugin(INTERACTION_MANAGER_PLUGIN_ID, registry, config),
  reducer,
  initialState,
};

export * from './interaction-manager-plugin';
export * from './types';
export * from './manifest';
export * from './reducer';
