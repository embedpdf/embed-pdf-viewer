import { PluginPackage } from '@embedpdf/core';
import { manifest, I18N_PLUGIN_ID } from './manifest';
import { I18nPluginConfig, I18nState } from './types';
import { I18nPlugin } from './i18n-plugin';
import { I18nAction } from './actions';
import { i18nReducer, initialState } from './reducer';

export const I18nPluginPackage: PluginPackage<I18nPlugin, I18nPluginConfig, I18nState, I18nAction> =
  {
    manifest,
    create: (registry, config) => new I18nPlugin(I18N_PLUGIN_ID, registry, config),
    reducer: i18nReducer,
    initialState,
  };

export * from './i18n-plugin';
export * from './types';
export * from './manifest';
export * from './locales';
