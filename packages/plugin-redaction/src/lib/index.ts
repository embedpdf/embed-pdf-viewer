import { PluginPackage } from '@embedpdf/core';
import { RedactionPluginConfig, RedactionState } from './types';
import { RedactionPlugin } from './redaction-plugin';
import { manifest, REDACTION_PLUGIN_ID } from './manifest';
import { RedactionAction } from './actions';
import { initialState, redactionReducer } from './reducer';

export const RedactionPluginPackage: PluginPackage<
  RedactionPlugin,
  RedactionPluginConfig,
  RedactionState,
  RedactionAction
> = {
  manifest,
  create: (registry, config) => new RedactionPlugin(REDACTION_PLUGIN_ID, registry, config),
  reducer: redactionReducer,
  initialState: initialState,
};

export * from './redaction-plugin';
export * from './types';
export * from './manifest';
export * from './selectors';
export * from './tools';
export { initialState, initialDocumentState } from './reducer';
