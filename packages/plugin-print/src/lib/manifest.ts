import { PluginManifest } from '@embedpdf/core';
import { PrintPluginConfig } from './types';

export const PRINT_PLUGIN_ID = 'print';

export const manifest: PluginManifest<PrintPluginConfig> = {
  id: PRINT_PLUGIN_ID,
  name: 'Print Plugin',
  version: '1.0.0',
  provides: ['print'],
  requires: [],
  optional: [],
  defaultConfig: {},
};
