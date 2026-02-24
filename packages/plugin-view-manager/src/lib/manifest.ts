import { PluginManifest } from '@embedpdf/core';
import { ViewManagerPluginConfig } from './types';

export const VIEW_MANAGER_PLUGIN_ID = 'view-manager';

export const manifest: PluginManifest<ViewManagerPluginConfig> = {
  id: VIEW_MANAGER_PLUGIN_ID,
  name: 'View Manager Plugin',
  version: '1.0.0',
  provides: ['view-manager'],
  requires: [],
  optional: ['document-manager'],
  defaultConfig: {
    defaultViewCount: 1,
  },
};
