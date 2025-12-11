import { PluginManifest } from '@embedpdf/core';
import { RenderPluginConfig } from './types';

export const RENDER_PLUGIN_ID = 'render';

export const manifest: PluginManifest<RenderPluginConfig> = {
  id: RENDER_PLUGIN_ID,
  name: 'Render Plugin',
  version: '1.0.0',
  provides: ['render'],
  requires: [],
  optional: [],
  defaultConfig: {},
};
