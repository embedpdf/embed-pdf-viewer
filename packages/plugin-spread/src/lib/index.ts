import { PluginPackage } from '@embedpdf/core';
import { SpreadPlugin } from './spread-plugin';
import { manifest, SPREAD_PLUGIN_ID } from './manifest';
import { SpreadPluginConfig, SpreadState } from './types';
import { spreadReducer, initialState } from './reducer';
import { SpreadAction } from './actions';

export const SpreadPluginPackage: PluginPackage<
  SpreadPlugin,
  SpreadPluginConfig,
  SpreadState,
  SpreadAction
> = {
  manifest,
  create: (registry, config) => new SpreadPlugin(SPREAD_PLUGIN_ID, registry, config),
  reducer: spreadReducer,
  initialState,
};

export * from './spread-plugin';
export * from './types';
export * from './manifest';
export * from './actions';
export * from './reducer';
