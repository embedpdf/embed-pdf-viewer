import { definePlugin } from '@embedpdf/core';
import { createCommandsCapability, registerCommand } from './capability';
import type { CommandRegistry } from './capability';
import { commandsReducer, initialCommandsState } from './reducer';
import { I18nToken } from '@embedpdf/plugin-i18n/contract';
import { ShellToken } from '@embedpdf/plugin-shell/contract';
import { CommandsToken } from './types';
import type { CommandsAction, CommandsCapability, CommandsConfig, CommandsState } from './types';

/**
 * The commands plugin: workspace-scoped (one vocabulary for the whole
 * workspace; resolution/execution bind to a target document per call).
 * Definitions live in the INSTANCE's closure — never in the store (they hold
 * functions) and never in the definition (a definition is an immutable recipe
 * that two kernels may share); the store slice holds only `disabledCategories`.
 */
export const commandsPlugin = (config?: CommandsConfig) =>
  definePlugin<CommandsState, CommandsAction, CommandsCapability>({
    id: 'commands',
    scope: 'workspace',
    token: CommandsToken,
    // Labels come from i18n and declarative menu/panel targets route through
    // shell; both are optional — the plugin degrades to raw keys / no routing.
    optional: [I18nToken, ShellToken],
    initialState: {
      ...initialCommandsState,
      disabledCategories: [...(config?.disabledCategories ?? [])],
    },
    reduce: commandsReducer,
    capability: (ctx) => {
      const registry: CommandRegistry = new Map();
      for (const def of config?.commands ?? []) registerCommand(registry, def);
      return createCommandsCapability(ctx, registry);
    },
  });
