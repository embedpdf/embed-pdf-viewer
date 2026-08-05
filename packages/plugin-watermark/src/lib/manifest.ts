import { PluginManifest } from '@embedpdf/core';
import { WatermarkPluginConfig } from './types';

export const WATERMARK_PLUGIN_ID = 'watermark';

export const manifest: PluginManifest<WatermarkPluginConfig> = {
  id: WATERMARK_PLUGIN_ID,
  name: 'Watermark Plugin',
  version: '1.0.0',
  provides: ['watermark'],
  requires: ['annotation'],
  optional: [],
  defaultConfig: {
    autoApply: true,
  },
};

