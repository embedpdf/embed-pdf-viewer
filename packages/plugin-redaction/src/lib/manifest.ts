import { PluginManifest } from '@embedpdf/core';
import { RedactionPluginConfig } from './types';

export const REDACTION_PLUGIN_ID = 'redaction';

export const manifest: PluginManifest<RedactionPluginConfig> = {
  id: REDACTION_PLUGIN_ID,
  name: 'Redaction Plugin',
  version: '1.0.0',
  provides: ['redaction'],
  requires: [],
  optional: ['interaction-manager', 'selection'],
  defaultConfig: {
    drawBlackBoxes: true,
  },
};
