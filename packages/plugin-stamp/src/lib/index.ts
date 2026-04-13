import { PluginPackage } from '@embedpdf/core';
import { manifest, STAMP_PLUGIN_ID } from './manifest';
import { StampPluginConfig, StampState } from './types';
import { StampPlugin } from './stamp-plugin';
import { stampReducer, initialState } from './reducer';
import { StampAction } from './actions';

export const StampPluginPackage: PluginPackage<
  StampPlugin,
  StampPluginConfig,
  StampState,
  StampAction
> = {
  manifest,
  create: (registry, config) => new StampPlugin(STAMP_PLUGIN_ID, registry, config),
  reducer: stampReducer,
  initialState,
};

export * from './stamp-plugin';
export * from './types';
export * from './manifest';
export * from './actions';
export * from './reducer';
export { RUBBER_STAMP_TOOL_ID } from './tools';
