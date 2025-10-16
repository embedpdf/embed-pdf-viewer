import { PluginPackage } from '@embedpdf/core';

import { PanPlugin } from './pan-plugin';
import { manifest, PAN_PLUGIN_ID } from './manifest';
import { PanPluginConfig, PanState } from './types';
import { panReducer, initialState } from './reducer';
import { PanAction } from './actions';

export const PanPluginPackage: PluginPackage<PanPlugin, PanPluginConfig, PanState, PanAction> = {
  manifest,
  create: (registry, config) => new PanPlugin(PAN_PLUGIN_ID, registry, config),
  reducer: panReducer,
  initialState,
};

export * from './pan-plugin';
export * from './types';
export * from './manifest';
export * from './actions';
export * from './reducer';
