import { PluginPackage } from '@embedpdf/core';
import { EditPluginConfig, EditState } from './types';
import { EditPlugin } from './edit-plugin';
import { manifest, EDIT_PLUGIN_ID } from './manifest';
import { EditAction } from './actions';
import { editReducer, initialState } from './reducer';

export const EditPluginPackage: PluginPackage<EditPlugin, EditPluginConfig, EditState, EditAction> =
  {
    manifest,
    create: (registry, config) => new EditPlugin(EDIT_PLUGIN_ID, registry, config),
    reducer: editReducer,
    initialState,
  };

export * from './edit-plugin';
export * from './types';
export * from './manifest';
