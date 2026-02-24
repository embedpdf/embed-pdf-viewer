import { PluginManifest } from '@embedpdf/core';
import { PanPluginConfig } from './types';

export const PAN_PLUGIN_ID = 'pan';

export const manifest: PluginManifest<PanPluginConfig> = {
  id: PAN_PLUGIN_ID,
  name: 'Pan Plugin',
  version: '1.0.0',
  provides: ['pan'],
  requires: ['interaction-manager', 'viewport'],
  optional: [],
  defaultConfig: {
    defaultMode: 'mobile',
  },
};
