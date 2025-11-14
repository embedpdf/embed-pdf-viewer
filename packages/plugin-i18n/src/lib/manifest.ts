import { PluginManifest } from '@embedpdf/core';
import { I18nPluginConfig } from './types';
import { enUS, esES } from './locales';

export const I18N_PLUGIN_ID = 'i18n';

export const manifest: PluginManifest<I18nPluginConfig> = {
  id: I18N_PLUGIN_ID,
  name: 'I18n Plugin',
  version: '1.0.0',
  provides: ['i18n'],
  requires: [],
  optional: [],
  defaultConfig: {
    enabled: true,
    defaultLocale: 'en',
    locales: [enUS, esES],
  },
};
