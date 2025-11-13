import { PluginPackage } from '@embedpdf/core';
import { manifest, UI_PLUGIN_ID } from './manifest';
import { UIPluginConfig, UIState } from './types';
import { UIPlugin } from './ui-plugin';
import { UIAction } from './actions';
import { uiReducer, initialState } from './reducer';

export const UIPluginPackage: PluginPackage<UIPlugin, UIPluginConfig, UIState, UIAction> = {
  manifest,
  create: (registry, config) => new UIPlugin(UI_PLUGIN_ID, registry, config),
  reducer: uiReducer,
  initialState,
};

export * from './ui-plugin';
export * from './types';
export * from './schema';
export * from './manifest';
export * from './utils';
