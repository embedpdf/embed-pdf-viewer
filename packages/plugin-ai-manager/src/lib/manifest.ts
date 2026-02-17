import { PluginManifest } from '@embedpdf/core';
import { AiManagerPluginConfig } from './types';
import { AiRuntime } from '@embedpdf/ai';

export const AI_MANAGER_PLUGIN_ID = 'ai-manager';

export const manifest: PluginManifest<AiManagerPluginConfig> = {
  id: AI_MANAGER_PLUGIN_ID,
  name: 'AI Manager Plugin',
  version: '1.0.0',
  provides: ['ai-manager'],
  requires: [],
  optional: [],
  defaultConfig: {
    // runtime must be provided by the user
    runtime: null as unknown as AiRuntime,
  },
};
