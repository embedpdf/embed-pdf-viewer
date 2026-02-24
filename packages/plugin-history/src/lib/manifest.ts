import { PluginManifest } from '@embedpdf/core';
import { HistoryPluginConfig } from './types';

export const HISTORY_PLUGIN_ID = 'history';

export const manifest: PluginManifest<HistoryPluginConfig> = {
  id: HISTORY_PLUGIN_ID,
  name: 'History Plugin',
  version: '1.0.0',
  provides: ['history'],
  requires: [],
  optional: [],
  defaultConfig: {},
};
