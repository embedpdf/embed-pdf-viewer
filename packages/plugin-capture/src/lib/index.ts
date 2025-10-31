import { PluginPackage } from '@embedpdf/core';
import { manifest, CAPTURE_PLUGIN_ID } from './manifest';
import { CapturePluginConfig } from './types';
import { CapturePlugin } from './capture-plugin';
import { captureReducer, initialState } from './reducer';

export const CapturePluginPackage: PluginPackage<CapturePlugin, CapturePluginConfig> = {
  manifest,
  create: (registry, config) => new CapturePlugin(CAPTURE_PLUGIN_ID, registry, config),
  reducer: captureReducer,
  initialState,
};

export * from './capture-plugin';
export * from './types';
export * from './manifest';
export * from './actions';
export * from './reducer';
