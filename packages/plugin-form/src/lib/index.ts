import { PluginPackage } from '@embedpdf/core';
import { manifest, FORM_PLUGIN_ID } from './manifest';
import { FormPluginConfig, FormState } from './types';
import { FormPlugin } from './form-plugin';
import { initialState, reducer } from './reducer';
import { FormAction } from './actions';

export const FormPluginPackage: PluginPackage<FormPlugin, FormPluginConfig, FormState, FormAction> =
  {
    manifest,
    create: (registry, config) => new FormPlugin(FORM_PLUGIN_ID, registry, config),
    reducer,
    initialState,
  };

export * from './form-plugin';
export * from './types';
export * from './manifest';
