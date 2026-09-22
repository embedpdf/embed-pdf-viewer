import { definePlugin } from '@embedpdf/core';
import { I18nToken } from '@embedpdf/plugin-i18n/contract';
import { ShellToken } from '@embedpdf/plugin-shell/contract';

import type { CommandsConfig } from './contract';
import { createCommandsController } from './controller';
import { CommandsToken } from './host-contract';
import type { CommandsHostCapability } from './host-contract';
import { commandsReducer, initialCommandsState } from './model';
import type { CommandsAction, CommandsState } from './model';

/**
 * The commands plugin: workspace-scoped (one vocabulary for the whole
 * workspace; resolution/execution bind to a target document per call).
 * Definitions live in the INSTANCE's registry — never in the store (they hold
 * functions) and never in the definition (a definition is an immutable recipe
 * that two kernels may share); the store slice holds only `disabledCategories`.
 */
export const commandsPlugin = (config: CommandsConfig = {}) =>
  definePlugin<CommandsState, CommandsAction, CommandsHostCapability>({
    id: 'commands',
    scope: 'workspace',
    token: CommandsToken,
    // Labels come from i18n and declarative menu/panel targets route through
    // shell; both are optional — the plugin degrades to raw keys / no routing.
    optional: [I18nToken, ShellToken],
    initialState: () => initialCommandsState(config.disabledCategories),
    reduce: commandsReducer,
    create: (ctx) => ({ api: createCommandsController(ctx, config) }),
  });
