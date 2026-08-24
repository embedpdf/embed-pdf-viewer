import { definePlugin } from '@embedpdf/core';
import { createCommandsCapability, registerCommand } from './capability';
import type { CommandRegistry } from './capability';
import { commandsReducer, initialCommandsState } from './reducer';
import { CommandsToken } from './types';
import type { CommandsAction, CommandsCapability, CommandsConfig, CommandsState } from './types';

/**
 * The commands plugin: workspace-scoped (one vocabulary for the whole
 * workspace; resolution/execution bind to a target document per call).
 * Definitions live in this closure — never in the store (they hold
 * functions); the store slice holds only `disabledCategories`.
 */
export const commandsPlugin = (config?: CommandsConfig) => {
  const registry: CommandRegistry = new Map();
  for (const def of config?.commands ?? []) registerCommand(registry, def);

  return definePlugin<CommandsState, CommandsAction, CommandsCapability>({
    id: 'commands',
    scope: 'workspace',
    token: CommandsToken,
    initialState: {
      ...initialCommandsState,
      disabledCategories: [...(config?.disabledCategories ?? [])],
    },
    reduce: commandsReducer,
    capability: (ctx) => createCommandsCapability(ctx, registry),
  });
};
