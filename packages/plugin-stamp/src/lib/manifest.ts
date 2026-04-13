import { PluginManifest } from '@embedpdf/core';
import { StampPluginConfig } from './types';

export const STAMP_PLUGIN_ID = 'stamp';

export const manifest: PluginManifest<StampPluginConfig> = {
  id: STAMP_PLUGIN_ID,
  name: 'Stamp Plugin',
  version: '1.0.0',
  provides: ['stamp'],
  requires: ['annotation'],
  optional: ['i18n'],
  defaultConfig: {
    defaultLibrary: {
      id: 'custom',
      name: 'Custom Stamps',
      nameKey: 'stamp.library.custom',
      categories: ['custom', 'sidebar'],
    },
    manifests: [
      {
        url: 'https://cdn.jsdelivr.net/npm/@embedpdf/default-stamps/{locale}/manifest.json',
        fallbackLocale: 'en',
      },
    ],
  },
};
