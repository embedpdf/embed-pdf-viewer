import { PluginManifest } from '@embedpdf/core';
import { SpreadPluginConfig } from './types';

export const SPREAD_PLUGIN_ID = 'spread';

export const manifest: PluginManifest<SpreadPluginConfig> = {
  id: SPREAD_PLUGIN_ID,
  name: 'Spread Plugin',
  version: '1.0.0',
  provides: ['spread'],
  requires: [],
  optional: ['viewport'],
  defaultConfig: {
    enabled: true,
  },
};
