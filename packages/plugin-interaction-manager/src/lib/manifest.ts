import { PluginManifest } from '@embedpdf/core';
import { InteractionManagerPluginConfig } from './types';

export const INTERACTION_MANAGER_PLUGIN_ID = 'interaction-manager';

export const manifest: PluginManifest<InteractionManagerPluginConfig> = {
  id: INTERACTION_MANAGER_PLUGIN_ID,
  name: 'Interaction Manager Plugin',
  version: '1.0.0',
  provides: ['interaction-manager'],
  requires: [],
  optional: [],
  defaultConfig: {
    exclusionRules: {
      classes: [],
      dataAttributes: ['data-no-interaction'],
    },
  },
};
