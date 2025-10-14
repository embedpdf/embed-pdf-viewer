import { PluginManifest } from '@embedpdf/core';
import { ScrollPluginConfig, ScrollStrategy } from './types';

export const SCROLL_PLUGIN_ID = 'scroll';

export const manifest: PluginManifest<ScrollPluginConfig> = {
  id: SCROLL_PLUGIN_ID,
  name: 'Scroll Plugin',
  version: '1.0.0',
  provides: ['scroll'],
  requires: ['viewport'],
  optional: [],
  defaultConfig: {
    enabled: true,
    defaultPageGap: 10,
    defaultBufferSize: 4,
    defaultStrategy: ScrollStrategy.Vertical,
  },
};
