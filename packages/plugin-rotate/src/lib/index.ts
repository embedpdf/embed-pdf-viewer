import { PluginPackage } from '@embedpdf/core';
import { manifest, ROTATE_PLUGIN_ID } from './manifest';
import { RotatePluginConfig, RotateState } from './types';
import { RotatePlugin } from './rotate-plugin';
import { RotateAction } from './actions';
import { rotateReducer, initialState } from './reducer';

export const RotatePluginPackage: PluginPackage<
  RotatePlugin,
  RotatePluginConfig,
  RotateState,
  RotateAction
> = {
  manifest,
  create: (registry, config) => new RotatePlugin(ROTATE_PLUGIN_ID, registry, config),
  reducer: rotateReducer,
  initialState,
};

export * from './rotate-plugin';
export * from './types';
export * from './manifest';
export * from './actions';
export * from './reducer';
export * from './utils';
