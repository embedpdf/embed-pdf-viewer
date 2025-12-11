import { PluginManifest } from '@embedpdf/core';

import { ViewportPluginConfig } from './types';

export const VIEWPORT_PLUGIN_ID = 'viewport';

export const manifest: PluginManifest<ViewportPluginConfig> = {
  id: VIEWPORT_PLUGIN_ID,
  name: 'Viewport Plugin',
  version: '1.0.0',
  provides: ['viewport'],
  requires: [],
  optional: [],
  defaultConfig: {
    viewportGap: 10,
    scrollEndDelay: 300,
  },
};
