import { PluginManifest } from '@embedpdf/core';
import { SearchPluginConfig } from './types';

export const SEARCH_PLUGIN_ID = 'search';

export const manifest: PluginManifest<SearchPluginConfig> = {
  id: SEARCH_PLUGIN_ID,
  name: 'Search Plugin',
  version: '1.0.0',
  provides: ['search'],
  requires: [],
  optional: [],
  defaultConfig: {
    flags: [],
  },
};
