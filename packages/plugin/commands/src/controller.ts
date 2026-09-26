/**
 * The commands controller: the registry, resolution against a target
 * document (derivations over live state, throw-safe), the one execution
 * path, category gating, and the host-only keystroke matcher.
 *
 * Definitions hold functions, so the registry is a closure map outside
 * state; every change to it calls `ctx.notify()` so resolution reads re-run.
 */
import {
  DocumentsToken,
  memo,
  memoByKey,
  toPluginError,
  toPluginErrorInfo,
  type CapabilityToken,
  type PluginContext,
  type Unsubscribe,
} from '@embedpdf/core';
import { matchShortcut, type KeyStroke } from '@embedpdf/core-ui';
import { I18nToken } from '@embedpdf/plugin-i18n/contract';
import { ShellToken } from '@embedpdf/plugin-shell/contract';

import type {
  CommandContext,
  CommandDef,
  CommandExecutedEvent,
  CommandExecutionFailedEvent,
  CommandsConfig,
  ExecuteResult,
  IconAccent,
  RegisterCommandOptions,
  ResolvedCommand,
} from './contract';
import type { CommandsHostCapability } from './host-contract';
import {
  disableCategory,
  enableCategory,
  setDisabledCategories,
  type CommandsState,
} from './model';
import { addCommand, type CommandRegistry, type RegisteredCommand } from './registry';

const panelTarget = (definition: CommandDef): { id: string; exclusive?: string } | null =>
  definition.panel === undefined
    ? null
    : typeof definition.panel === 'string'
      ? { id: definition.panel }
      : definition.panel;

/**
 * One command's live derivations for a target document, as values a memo can
 * compare: the entry, label, accent colors, and the enabled/active/visible flags.
 */
type Derivations = readonly [
  entry: RegisteredCommand | null,
  label: string,
  accentPrimary: string | undefined,
  accentSecondary: string | undefined,
  enabled: boolean,
  active: boolean,
  visible: boolean,
];

const NOT_REGISTERED: Derivations = [null, '', undefined, undefined, false, false, false];

const accentOf = (primary?: string, secondary?: string): IconAccent | undefined =>
  primary === undefined && secondary === undefined
    ? undefined
    : {
        ...(primary !== undefined ? { primary } : {}),
        ...(secondary !== undefined ? { secondary } : {}),
      };

/** The memo key of a resolution: the command id and the explicit target document. */
const resolutionKey = (id: string, documentId: string | undefined): string =>
  JSON.stringify([id, documentId ?? null]);

export function createCommandsController(
  ctx: PluginContext<CommandsState>,
  config: CommandsConfig = {},
) {
  const registry: CommandRegistry = new Map();
  for (const definition of config.commands ?? []) addCommand(registry, definition);
  /** Bumped on every registry change: the input of the reads built from the registry alone. */
  let registryVersion = 0;
  const registryChanged = (): void => {
    registryVersion += 1;
    ctx.notify();
  };

  const executed = ctx.events.source<CommandExecutedEvent>();
  const executionFailed = ctx.events.source<CommandExecutionFailedEvent>();

  const state = () => ctx.state.get();

  /** Bind capability resolution to the command's target document. The kernel
   *  resolves workspace tokens regardless of the document argument, so one
   *  code path serves both scopes. */
  const commandContext = (documentId?: string, args?: unknown): CommandContext => {
    const target = documentId ?? ctx.get(DocumentsToken).getActiveId();
    const get = <T>(token: CapabilityToken<T>): T =>
      target ? ctx.forDocument(token, target) : ctx.get(token);
    return {
      documentId: target,
      ...(args === undefined ? {} : { args }),
      get,
      tryGet: <T>(token: CapabilityToken<T>): T | null => {
        try {
          return get(token);
        } catch {
          return null;
        }
      },
    };
  };

  /** Derivations run against live state; a derivation that throws (e.g. it
   *  needs a document and none is open) falls back to the safe default, so
   *  the button renders disabled instead of breaking. */
  const derive = (
    derivation: ((context: CommandContext) => boolean) | undefined,
    context: CommandContext,
    fallback: boolean,
  ): boolean => {
    if (!derivation) return fallback;
    try {
      return derivation(context);
    } catch {
      return fallback;
    }
  };
  const deriveAccent = (
    derivation: ((context: CommandContext) => IconAccent | null) | undefined,
    context: CommandContext,
  ): IconAccent | undefined => {
    if (!derivation) return undefined;
    try {
      return derivation(context) ?? undefined;
    } catch {
      return undefined;
    }
  };

  const derivationsOf = (entry: RegisteredCommand, documentId?: string): Derivations => {
    const { definition } = entry;
    const context = commandContext(documentId);
    const disabled = state().disabledCategories;
    const categoryHidden = (definition.categories ?? []).some((category) =>
      disabled.includes(category),
    );
    const i18n = context.tryGet(I18nToken);
    const label = i18n ? i18n.t(definition.labelKey) : definition.labelKey;
    // Surface-target commands derive `active` from the surface's open state
    // unless the definition overrides it.
    let active: boolean;
    if (definition.active) {
      active = derive(definition.active, context, false);
    } else {
      const shell = context.tryGet(ShellToken);
      const panel = panelTarget(definition);
      active = shell
        ? definition.menu
          ? shell.isMenuOpen(definition.menu)
          : panel
            ? shell.isOpen(panel.id)
            : definition.modal
              ? shell.isOpen(definition.modal)
              : false
        : false;
    }
    const accent = deriveAccent(definition.iconAccent, context);
    return [
      entry,
      label,
      accent?.primary,
      accent?.secondary,
      derive(definition.enabled, context, true) && !categoryHidden,
      active,
      derive(definition.visible, context, true) && !categoryHidden,
    ];
  };

  /** A resolved command, the same object until one of its derivations or its entry changes. */
  const resolvedByKey = memoByKey(
    (key: string): Derivations => {
      const [id, documentId] = JSON.parse(key) as [string, string | null];
      const entry = registry.get(id);
      return entry ? derivationsOf(entry, documentId ?? undefined) : NOT_REGISTERED;
    },
    (
      _key,
      entry,
      label,
      accentPrimary,
      accentSecondary,
      enabled,
      active,
      visible,
    ): ResolvedCommand | null =>
      entry && {
        id: entry.definition.id,
        label,
        icon: entry.definition.icon,
        iconAccent: accentOf(accentPrimary, accentSecondary),
        shortcuts: entry.shortcuts,
        menu: entry.definition.menu,
        enabled,
        active,
        visible,
        categories: entry.definition.categories ?? [],
      },
  );
  const resolveCommand = (id: string, documentId?: string): ResolvedCommand | null =>
    registry.has(id) ? resolvedByKey(resolutionKey(id, documentId)) : null;

  const listCommandIds = memo(
    () => [registryVersion],
    (_version) => [...registry.keys()],
  );
  /** Keyed by the explicit target document; `''` resolves against the active one. */
  const commandsByDocument = memoByKey(
    (documentKey: string) =>
      listCommandIds().map((id) => resolveCommand(id, documentKey || undefined)),
    (_documentKey, ...resolved) =>
      resolved.filter((command): command is ResolvedCommand => command !== null),
  );
  const listCommands = (documentId?: string): readonly ResolvedCommand[] =>
    commandsByDocument(documentId ?? '');
  const listShortcuts = memo(
    () => [registryVersion],
    (_version) =>
      [...registry.values()].flatMap((entry) =>
        entry.shortcuts.map((shortcut) => ({ commandId: entry.definition.id, shortcut })),
      ),
  );

  const execute = async (
    id: string,
    options: { documentId?: string; args?: unknown } = {},
  ): Promise<ExecuteResult> => {
    const entry = registry.get(id);
    if (!entry) return { status: 'rejected', reason: 'not-found' };
    const resolved = resolveCommand(id, options.documentId);
    if (!resolved || !resolved.visible) return { status: 'rejected', reason: 'hidden' };
    if (!resolved.enabled) return { status: 'rejected', reason: 'disabled' };
    const context = commandContext(options.documentId, options.args);
    try {
      if (entry.definition.run) {
        await entry.definition.run(context);
      } else {
        // Default routing for declarative surface targets.
        const shell = context.tryGet(ShellToken);
        const panel = panelTarget(entry.definition);
        if (shell) {
          if (entry.definition.menu) shell.toggleMenu(entry.definition.menu);
          else if (panel) shell.toggle(panel.id, { exclusive: panel.exclusive });
          else if (entry.definition.modal) {
            shell.toggle(entry.definition.modal, { exclusive: 'modal' });
          }
        }
      }
    } catch (error) {
      const failure = toPluginError('commands', error);
      executionFailed.emit({
        commandId: id,
        documentId: context.documentId,
        error: toPluginErrorInfo(failure),
      });
      throw failure;
    }
    executed.emit({ commandId: id, documentId: context.documentId, args: options.args });
    return { status: 'executed' };
  };

  const registerOne = (definition: CommandDef, options?: RegisterCommandOptions): Unsubscribe => {
    const entry = addCommand(registry, definition, options);
    registryChanged();
    return () => {
      // Own this registration only: a later replacement is not ours to remove.
      if (registry.get(definition.id) !== entry) return;
      registry.delete(definition.id);
      registryChanged();
    };
  };

  const api: CommandsHostCapability = {
    registerCommand: registerOne,
    registerCommands: (definitions, options) => {
      const removers = definitions.map((definition) => registerOne(definition, options));
      return () => removers.forEach((remove) => remove());
    },
    hasCommand: (id) => registry.has(id),
    getCommand: (id) => registry.get(id)?.definition ?? null,
    listCommandIds,
    resolveCommand,
    listCommands,
    searchCommands: (query, documentId) => {
      const needle = query.trim().toLowerCase();
      return listCommands(documentId).filter(
        (command) =>
          command.visible &&
          (needle === '' ||
            command.label.toLowerCase().includes(needle) ||
            command.id.includes(needle)),
      );
    },
    listShortcuts,
    execute,
    canExecute: (id, documentId) => {
      const resolved = resolveCommand(id, documentId);
      return !!resolved && resolved.enabled && resolved.visible;
    },
    getDisabledCategories: () => state().disabledCategories,
    isCategoryDisabled: (category) => state().disabledCategories.includes(category),
    disableCategory: (category) => ctx.state.update(disableCategory, category),
    enableCategory: (category) => ctx.state.update(enableCategory, category),
    setDisabledCategories: (categories) => ctx.state.update(setDisabledCategories, categories),
    onExecuted: executed.on,
    onExecutionFailed: executionFailed.on,
    // ── host lens ──
    matchStroke: (stroke: KeyStroke, options) => {
      for (const [id, entry] of registry) {
        if (entry.parsed.some((shortcut) => matchShortcut(shortcut, stroke, options))) return id;
      }
      return null;
    },
    getMenuTarget: (id) => {
      const entry = registry.get(id);
      return entry ? { menu: entry.definition.menu } : null;
    },
  };

  return { api };
}
