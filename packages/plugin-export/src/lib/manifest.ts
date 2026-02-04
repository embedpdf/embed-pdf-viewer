import { PluginManifest } from '@embedpdf/core';
import { ExportPluginConfig } from './types';

export const EXPORT_PLUGIN_ID = 'export';

export const manifest: PluginManifest<ExportPluginConfig> = {
  id: EXPORT_PLUGIN_ID,
  name: 'Export Plugin',
  version: '1.0.0',
  provides: ['export'],
  requires: [],
  optional: [],
  defaultConfig: {
    defaultFileName: 'document.pdf',
  },
};
