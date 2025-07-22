import { PluginManifest } from '@embedpdf/core';
import { RichTextPluginConfig } from './types';

export const RICH_TEXT_PLUGIN_ID = 'rich-text';

export const manifest: PluginManifest<RichTextPluginConfig> = {
  id: RICH_TEXT_PLUGIN_ID,
  name: 'Rich Text Plugin',
  version: '1.0.0',
  provides: ['rich-text'],
  requires: [],
  optional: [],
  defaultConfig: {
    enabled: true,
  },
};
