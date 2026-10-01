import { definePlugin } from '@embedpdf/core';
import { I18nToken } from '@embedpdf/plugin-i18n/contract';
import { ShellToken } from '@embedpdf/plugin-shell/contract';

import { COMMANDS_DEFAULTS, type CommandsConfig } from './contract';
import { createCommandsController } from './controller';
import { CommandsToken } from './host-contract';

/**
 * The commands: one set for the whole workspace, each resolved and run for a
 * document (the one named, else the document in scope, else the active one).
 * Definitions are settings and app content, never state, since they hold
 * functions. `config` is the settings the app registers, over
 * {@link COMMANDS_DEFAULTS}.
 */
export const commandsPlugin = (config?: CommandsConfig) =>
  definePlugin({
    id: 'commands',
    scope: 'workspace',
    token: CommandsToken,
    // Labels come from i18n, and commands that open a panel, menu or dialog
    // go through shell; without them a label is the command's own, and those
    // commands open nothing.
    optional: [I18nToken, ShellToken],
    // Command definitions come from the app and may use any capability.
    resolvesAnyCapability: true,
    settings: { defaults: COMMANDS_DEFAULTS, registered: config },
    create: createCommandsController,
    // Inside a document's scope, a call that leaves out the document is for that one.
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
