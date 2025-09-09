import { PluginManifest } from '@embedpdf/core';
import { FormPluginConfig } from './types';

export const FORM_PLUGIN_ID = 'form';

export const manifest: PluginManifest<FormPluginConfig> = {
  id: FORM_PLUGIN_ID,
  name: 'Form Plugin',
  version: '1.0.0',
  provides: ['form'],
  requires: ['interaction-manager'],
  optional: ['history'],
  defaultConfig: {
    enabled: true,
  },
};
