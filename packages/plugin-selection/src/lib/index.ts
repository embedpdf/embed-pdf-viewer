import { PluginPackage } from '@embedpdf/core';
import { manifest, SELECTION_PLUGIN_ID } from './manifest';
import { SelectionPluginConfig, SelectionState } from './types';

import { SelectionPlugin } from './selection-plugin';
import { SelectionAction } from './actions';
import { selectionReducer, initialState } from './reducer';

export const SelectionPluginPackage: PluginPackage<
  SelectionPlugin,
  SelectionPluginConfig,
  SelectionState,
  SelectionAction
> = {
  manifest,
  create: (registry, config) => new SelectionPlugin(SELECTION_PLUGIN_ID, registry, config),
  reducer: selectionReducer,
  initialState,
};

export * from './selection-plugin';
export * from './types';
export * from './manifest';
export * from './utils';
