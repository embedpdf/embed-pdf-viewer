import { PluginManifest } from '@embedpdf/core';

import { TilingPluginConfig } from './types';

export const TILING_PLUGIN_ID = 'tiling';

export const manifest: PluginManifest<TilingPluginConfig> = {
  id: TILING_PLUGIN_ID,
  name: 'Tiling Plugin',
  version: '1.0.0',
  provides: ['tiling'],
  requires: ['render', 'scroll', 'viewport'],
  optional: [],
  defaultConfig: {
    tileSize: 768,
    overlapPx: 2.5,
    extraRings: 0,
  },
};
