import { PluginManifest } from '@embedpdf/core';
import { RotatePluginConfig } from './types';

export const ROTATE_PLUGIN_ID = 'rotate';

export const manifest: PluginManifest<RotatePluginConfig> = {
  id: ROTATE_PLUGIN_ID,
  name: 'Rotate Plugin',
  version: '1.0.0',
  provides: ['rotate'],
  requires: [],
  optional: [],
  defaultConfig: {
    enabled: true,
  },
};
