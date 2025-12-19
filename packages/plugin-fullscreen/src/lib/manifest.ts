import { PluginManifest } from '@embedpdf/core';
import { FullscreenPluginConfig } from './types';

export const FULLSCREEN_PLUGIN_ID = 'fullscreen';

export const manifest: PluginManifest<FullscreenPluginConfig> = {
  id: FULLSCREEN_PLUGIN_ID,
  name: 'Fullscreen Plugin',
  version: '1.0.0',
  provides: ['fullscreen'],
  requires: [],
  optional: [],
  defaultConfig: {},
};
