import { PluginManifest } from '@embedpdf/core';
import { CommandsPluginConfig } from './types';

export const COMMANDS_PLUGIN_ID = 'commands';

export const manifest: PluginManifest<CommandsPluginConfig> = {
  id: COMMANDS_PLUGIN_ID,
  name: 'Commands Plugin',
  version: '1.0.0',
  provides: ['commands'],
  requires: [],
  optional: ['i18n'],
  defaultConfig: {
    commands: {},
  },
};
