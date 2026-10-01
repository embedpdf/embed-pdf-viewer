import { definePlugin } from '@embedpdf/core';
import { I18nToken } from '@embedpdf/plugin-i18n/contract';
import { ShellToken } from '@embedpdf/plugin-shell/contract';

import type { CommandsConfig } from './contract';
import { createCommandsController } from './controller';
import { CommandsToken } from './host-contract';
import { initialCommandsState } from './model';

/**
 * The commands plugin: workspace-scoped (one vocabulary for the whole
 * workspace; resolution and execution bind to a target document per call:
 * the one named, else the document in scope, else the active one).
 * Definitions live in the instance's registry — never in state (they hold
 * functions) and never in the plugin definition (an immutable recipe two
 * kernels may share); state holds only `disabledCategories`.
 */
export const commandsPlugin = (config: CommandsConfig = {}) =>
  definePlugin({
    id: 'commands',
    scope: 'workspace',
    token: CommandsToken,
    // Labels come from i18n and declarative menu/panel targets route through
    // shell; both are optional — the plugin degrades to raw keys / no routing.
    optional: [I18nToken, ShellToken],
    // Command definitions come from the host and act on any capability.
    resolvesAnyCapability: true,
    state: () => initialCommandsState(config.disabledCategories),
    create: (ctx) => createCommandsController(ctx, config),
    // Inside a document's scope, a call that leaves out the document targets that one.
    inScope: (commands, documentId) => ({
      ...commands,
      resolveCommand: (id, target = documentId) => commands.resolveCommand(id, target),
      listCommands: (target = documentId) => commands.listCommands(target),
      searchCommands: (query, target = documentId) => commands.searchCommands(query, target),
      execute: (id, options) =>
        commands.execute(id, { ...options, documentId: options?.documentId ?? documentId }),
      canExecute: (id, target = documentId) => commands.canExecute(id, target),
    }),
  });
