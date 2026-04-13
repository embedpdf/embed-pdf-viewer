import { PluginPackage } from '@embedpdf/core';
import { manifest, SIGNATURE_PLUGIN_ID } from './manifest';
import { SignaturePluginConfig, SignatureState } from './types';
import { SignaturePlugin } from './signature-plugin';
import { signatureReducer, initialState } from './reducer';
import { SignatureAction } from './actions';

export const SignaturePluginPackage: PluginPackage<
  SignaturePlugin,
  SignaturePluginConfig,
  SignatureState,
  SignatureAction
> = {
  manifest,
  create: (registry, config) => new SignaturePlugin(SIGNATURE_PLUGIN_ID, registry, config),
  reducer: signatureReducer,
  initialState,
};

export * from './signature-plugin';
export * from './types';
export * from './manifest';
export * from './actions';
export * from './reducer';
export { SIGNATURE_STAMP_TOOL_ID, SIGNATURE_INK_TOOL_ID } from './tools';
export * from './serialization';
