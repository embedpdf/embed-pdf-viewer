import { PluginPackage } from '@embedpdf/core';
import { ViewManagerPlugin } from './view-manager-plugin';
import { manifest, VIEW_MANAGER_PLUGIN_ID } from './manifest';
import { ViewManagerPluginConfig, ViewManagerState } from './types';
import { viewManagerReducer, initialState } from './reducer';
import { ViewManagerAction } from './actions';

export const ViewManagerPluginPackage: PluginPackage<
  ViewManagerPlugin,
  ViewManagerPluginConfig,
  ViewManagerState,
  ViewManagerAction
> = {
  manifest,
  create: (registry, config) => new ViewManagerPlugin(VIEW_MANAGER_PLUGIN_ID, registry, config),
  reducer: viewManagerReducer,
  initialState,
};

export * from './view-manager-plugin';
export * from './types';
export * from './manifest';
export * from './actions';
