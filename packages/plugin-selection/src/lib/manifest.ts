import { PluginManifest } from '@embedpdf/core';
import { SelectionPluginConfig } from './types';

export const SELECTION_PLUGIN_ID = 'selection';

export const manifest: PluginManifest<SelectionPluginConfig> = {
  id: SELECTION_PLUGIN_ID,
  name: 'Selection Plugin',
  version: '1.0.0',
  provides: ['selection'],
  requires: ['interaction-manager'],
  optional: ['viewport', 'scroll'],
  defaultConfig: {
    enabled: true,
  },
};
