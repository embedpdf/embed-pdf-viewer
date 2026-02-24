import { PluginManifest } from '@embedpdf/core';
import { CapturePluginConfig } from './types';

export const CAPTURE_PLUGIN_ID = 'capture';

export const manifest: PluginManifest<CapturePluginConfig> = {
  id: CAPTURE_PLUGIN_ID,
  name: 'Capture Plugin',
  version: '1.0.0',
  provides: ['capture'],
  requires: ['render'],
  optional: ['interaction-manager'],
  defaultConfig: {
    scale: 1,
    imageType: 'image/png',
    withAnnotations: false,
  },
};
