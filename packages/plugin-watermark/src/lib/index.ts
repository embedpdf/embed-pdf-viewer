import { PluginPackage } from '@embedpdf/core';
import { manifest, WATERMARK_PLUGIN_ID } from './manifest';
import { WatermarkPluginConfig, WatermarkState } from './types';
import { WatermarkPlugin } from './watermark-plugin';
import { watermarkReducer, initialState } from './reducer';
import { WatermarkAction } from './actions';

export const WatermarkPluginPackage: PluginPackage<
  WatermarkPlugin,
  WatermarkPluginConfig,
  WatermarkState,
  WatermarkAction
> = {
  manifest,
  create: (registry, config) => new WatermarkPlugin(WATERMARK_PLUGIN_ID, registry, config),
  reducer: watermarkReducer,
  initialState,
};

export * from './watermark-plugin';
export * from './types';
export * from './manifest';
export * from './actions';
export * from './reducer';

