import { PluginPackage } from '@embedpdf/core';
import { manifest, COMMANDS_PLUGIN_ID } from './manifest';
import { CommandsPluginConfig, CommandsState } from './types';
import { CommandsPlugin } from './commands-plugin';
import { CommandsAction } from './actions';
import { commandsReducer, initialState } from './reducer';

export const CommandsPluginPackage: PluginPackage<
  CommandsPlugin,
  CommandsPluginConfig,
  CommandsState,
  CommandsAction
> = {
  manifest,
  create: (registry, config) => new CommandsPlugin(COMMANDS_PLUGIN_ID, registry, config),
  reducer: commandsReducer,
  initialState,
};

export * from './commands-plugin';
export * from './types';
export * from './manifest';
