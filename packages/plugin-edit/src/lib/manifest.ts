import { PluginManifest } from '@embedpdf/core';
import { EditPluginConfig } from './types';

export const EDIT_PLUGIN_ID = 'edit';

export const manifest: PluginManifest<EditPluginConfig> = {
  id: EDIT_PLUGIN_ID,
  name: 'Edit Plugin',
  version: '1.0.0',
  provides: ['edit'],
  requires: [],
  optional: ['interaction-manager'],
  defaultConfig: {
    autoDetect: true,
  },
};
