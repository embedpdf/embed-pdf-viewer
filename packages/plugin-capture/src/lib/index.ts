import { PluginPackage } from '@embedpdf/core';
import { manifest, CAPTURE_PLUGIN_ID } from './manifest';
import { CapturePluginConfig, CaptureState } from './types';
import { CapturePlugin } from './capture-plugin';
import { captureReducer, initialState } from './reducer';
import { CaptureAction } from './actions';

export const CapturePluginPackage: PluginPackage<
  CapturePlugin,
  CapturePluginConfig,
  CaptureState,
  CaptureAction
> = {
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
