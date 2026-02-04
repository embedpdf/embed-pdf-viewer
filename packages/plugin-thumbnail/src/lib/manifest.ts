import { PluginManifest } from '@embedpdf/core';
import { ThumbnailPluginConfig } from './types';

export const THUMBNAIL_PLUGIN_ID = 'thumbnail';

export const manifest: PluginManifest<ThumbnailPluginConfig> = {
  id: THUMBNAIL_PLUGIN_ID,
  name: 'Thumbnail Plugin',
  version: '1.0.0',
  provides: ['thumbnail'],
  requires: ['render'],
  optional: ['scroll'],
  defaultConfig: {
    width: 150,
    gap: 10,
    buffer: 3,
    labelHeight: 16,
    autoScroll: true,
    scrollBehavior: 'smooth',
    imagePadding: 0,
    paddingY: 0,
  },
};
