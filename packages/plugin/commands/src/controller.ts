/**
 * The commands controller: the commands (from the settings, added while the
 * app runs, and from families), resolution for a document (derivations over
 * live state, safe to throw), the one way to run a command, the categories,
 * and the host-only keystroke matcher.
 *
 * Definitions hold functions, so the commands added while the app runs are a
 * map outside state; every change to it calls `ctx.notify()` so readers read
 * again.
 */
import {
  DocumentsToken,
  isPluginError,
  memo,
  memoByKey,
  PluginError,
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
  CommandFamily,
  CommandsSettings,
  ExecuteOptions,
  ExecuteResult,
  IconAccent,
  RegisterCommandOptions,
  ResolvedCommand,
} from './contract';
import type { CommandsHostCapability } from './host-contract';
import {
  configuredCommands,
  registeredCommand,
  type ConfiguredCommands,
  type RegisteredCommand,
} from './registry';

const panelTarget = (definition: CommandDef): { id: string; exclusive?: string } | null =>
  definition.panel === undefined
    ? null
    : typeof definition.panel === 'string'
      ? { id: definition.panel }
      : definition.panel;

/**
 * One command's live derivations for a document, as values a memo can
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
const NO_NAMES: readonly string[] = [];

const accentOf = (primary?: string, secondary?: string): IconAccent | undefined =>
  primary === undefined && secondary === undefined
    ? undefined
    : {
        ...(primary !== undefined ? { primary } : {}),
        ...(secondary !== undefined ? { secondary } : {}),
      };

/** The memo key of a resolution: the command id and the document named, if any. */
const resolutionKey = (id: string, documentId: string | undefined): string =>
  JSON.stringify([id, documentId ?? null]);

export function createCommandsController(ctx: PluginContext<void, CommandsSettings>) {
  const settings = ctx.settings();

  /** Commands added while the app runs, in the order they were added. */
  const registered = new Map<string, RegisteredCommand>();
  /** Bumped on every change to `registered`: the input of the reads built from it. */
  let registeredVersion = 0;
  const registeredChanged = (): void => {
    registeredVersion += 1;
    ctx.notify();
  };

  /** The commands the settings define, rebuilt when the setting changes. */
  const configured = memo(
    () => [settings.get().commands],
    (items): ConfiguredCommands => configuredCommands(items),
  );

  const executed = ctx.events.source<CommandExecutedEvent>();
  const executionFailed = ctx.events.source<CommandExecutionFailedEvent>();

  /** Capabilities for the command's document: the one named, else the active one. */
  const commandContext = (
    documentId?: string,
    call: { args?: unknown; signal?: AbortSignal } = {},
  ): CommandContext => {
    const target = documentId ?? ctx.get(DocumentsToken).getActiveId();
    const get = <T>(token: CapabilityToken<T>): T =>
      target ? ctx.forDocument(token, target) : ctx.get(token);
    return {
      documentId: target,
      ...(call.args === undefined ? {} : { args: call.args }),
      ...(call.signal ? { signal: call.signal } : {}),
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

  /** A family's command for one name, made once so it keeps its identity. */
  const familyCommands = new WeakMap<CommandFamily, Map<string, RegisteredCommand>>();
  const familyCommand = (family: CommandFamily, name: string): RegisteredCommand => {
    let byName = familyCommands.get(family);
    if (!byName) {
      byName = new Map();
      familyCommands.set(family, byName);
    }
    let entry = byName.get(name);
    if (!entry) {
      entry = registeredCommand({ ...family.command(name), id: `${family.prefix}${name}` });
      byName.set(name, entry);
    }
    return entry;
  };

  /** The command with this id: one added while the app runs, else the settings', else a family's. */
  const entryOf = (id: string): RegisteredCommand | null => {
    const { commands, families } = configured();
    const entry = registered.get(id) ?? commands.get(id);
    if (entry) return entry;
    const family = families.find(
      (candidate) => id.startsWith(candidate.prefix) && id.length > candidate.prefix.length,
    );
    return family ? familyCommand(family, id.slice(family.prefix.length)) : null;
  };

  /** Every command with its own definition (not a family's), each id once. */
  const definedCommands = memo(
    () => [registeredVersion, configured()],
    (_version, { commands }) => {
      const entries = new Map(commands);
      for (const [id, entry] of registered) entries.set(id, entry);
      return [...entries.values()];
    },
  );

  // Derivations run against live state; one that throws (it needs a document
  // and none is open, say) falls back to a safe default, so the button renders
  // disabled instead of breaking.
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
  const namesOf = (family: CommandFamily, context: CommandContext): readonly string[] => {
    try {
      return family.names(context);
    } catch {
      return NO_NAMES;
    }
  };

  /** The label: the key's string when a language has it, else `label`, else the key or the id. */
  const labelOf = (definition: CommandDef, context: CommandContext): string => {
    const i18n = definition.labelKey ? context.tryGet(I18nToken) : null;
    if (i18n && definition.labelKey) {
      return definition.label === undefined
        ? i18n.t(definition.labelKey)
        : i18n.t(definition.labelKey, { fallback: definition.label });
    }
    return definition.label ?? definition.labelKey ?? definition.id;
  };

  const derivationsOf = (entry: RegisteredCommand, documentId?: string): Derivations => {
    const { definition } = entry;
    const context = commandContext(documentId);
    const disabled = settings.get().disabledCategories;
    const categoryOff = (definition.categories ?? []).some((category) =>
      disabled.includes(category),
    );
    // A command that opens something is active while it's open, unless it says otherwise.
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
      labelOf(definition, context),
      accent?.primary,
      accent?.secondary,
      derive(definition.enabled, context, true) && !categoryOff,
      active,
      derive(definition.visible, context, true) && !categoryOff,
    ];
  };

  /** A resolved command, the same object until one of its derivations or its entry changes. */
  const resolvedByKey = memoByKey(
    (key: string): Derivations => {
      const [id, documentId] = JSON.parse(key) as [string, string | null];
      const entry = entryOf(id);
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
    entryOf(id) ? resolvedByKey(resolutionKey(id, documentId)) : null;

  /**
   * Every command's id for a document (`''` is the active one): the defined ones in the order
   * they were added, then each family's names that no defined command took.
   */
  const idsByDocument = memoByKey(
    (documentKey: string): readonly unknown[] => {
      const config = configured();
      const context = commandContext(documentKey || undefined);
      return [
        definedCommands(),
        config,
        ...config.families.map((family) => namesOf(family, context)),
      ];
    },
    (_documentKey, ...inputs): readonly string[] => {
      const [defined, { families }, ...names] = inputs as [
        readonly RegisteredCommand[],
        ConfiguredCommands,
        ...(readonly string[])[],
      ];
      const ids = defined.map((entry) => entry.definition.id);
      const taken = new Set(ids);
      families.forEach((family, index) => {
        for (const name of names[index] ?? NO_NAMES) {
          const id = `${family.prefix}${name}`;
          if (taken.has(id)) continue;
          taken.add(id);
          ids.push(id);
        }
      });
      return ids;
    },
  );
  const commandsByDocument = memoByKey(
    (documentKey: string) =>
      idsByDocument(documentKey).map((id) => resolveCommand(id, documentKey || undefined)),
    (_documentKey, ...resolved) =>
      resolved.filter((command): command is ResolvedCommand => command !== null),
  );
  const listCommands = (documentId?: string): readonly ResolvedCommand[] =>
    commandsByDocument(documentId ?? '');

  const listShortcuts = memo(
    () => [definedCommands()],
    (entries) =>
      entries.flatMap((entry) =>
        entry.shortcuts.map((shortcut) => ({ commandId: entry.definition.id, shortcut })),
      ),
  );

  /** What running a command does: its `run`, or opening what it opens. */
  const runCommand = async (definition: CommandDef, context: CommandContext): Promise<void> => {
    if (definition.run) {
      await definition.run(context);
      return;
    }
    const shell = context.tryGet(ShellToken);
    const panel = panelTarget(definition);
    if (!shell) return;
    if (definition.menu) shell.toggleMenu(definition.menu);
    else if (panel) shell.toggle(panel.id, { exclusive: panel.exclusive });
    else if (definition.modal) shell.toggle(definition.modal, { exclusive: 'modal' });
  };

  const execute = async (id: string, options: ExecuteOptions = {}): Promise<ExecuteResult> => {
    const { signal, documentId, args } = options;
    if (signal?.aborted) {
      throw new PluginError('operation-cancelled', 'commands', 'operation cancelled');
    }
    const entry = entryOf(id);
    if (!entry) return { status: 'rejected', reason: 'not-found' };
    const resolved = resolveCommand(id, documentId);
    if (!resolved?.visible) return { status: 'rejected', reason: 'hidden' };
    if (!resolved.enabled) return { status: 'rejected', reason: 'disabled' };
    const context = commandContext(documentId, { args, signal });
    try {
      await ctx.cancellable(signal, runCommand(entry.definition, context));
    } catch (error) {
      // The caller cancelling isn't the command failing.
      if (signal?.aborted && isPluginError(error, 'operation-cancelled')) throw error;
      const failure = toPluginError('commands', error);
      executionFailed.emit({
        commandId: id,
        documentId: context.documentId,
        error: toPluginErrorInfo(failure),
      });
      throw failure;
    }
    executed.emit({ commandId: id, documentId: context.documentId, args });
    return { status: 'executed' };
  };

  const registerOne = (definition: CommandDef, options?: RegisterCommandOptions): Unsubscribe => {
    const taken = registered.has(definition.id) || configured().commands.has(definition.id);
    if (taken && !options?.replace) {
      throw new PluginError('conflict', 'commands', `duplicate command '${definition.id}'`);
    }
    const entry = registeredCommand(definition);
    registered.set(definition.id, entry);
    registeredChanged();
    return () => {
      // Own this registration only: a later replacement is not ours to remove.
      if (registered.get(definition.id) !== entry) return;
      registered.delete(definition.id);
      registeredChanged();
    };
  };

  const disabledCategories = () => settings.get().disabledCategories;

  const api: CommandsHostCapability = {
    ...settings.api,
    registerCommand: registerOne,
    registerCommands: (definitions, options) => {
      const removers = definitions.map((definition) => registerOne(definition, options));
      return () => removers.forEach((remove) => remove());
    },
    hasCommand: (id) => entryOf(id) !== null,
    getCommand: (id) => entryOf(id)?.definition ?? null,
    listCommandIds: () => idsByDocument(''),
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
    getDisabledCategories: disabledCategories,
    isCategoryDisabled: (category) => disabledCategories().includes(category),
    disableCategory: (category) => {
      const current = disabledCategories();
      if (current.includes(category)) return;
      settings.api.updateSettings({ disabledCategories: [...current, category] });
    },
    enableCategory: (category) => {
      const current = disabledCategories();
      if (!current.includes(category)) return;
      settings.api.updateSettings({
        disabledCategories: current.filter((other) => other !== category),
      });
    },
    setDisabledCategories: (categories) =>
      settings.api.updateSettings({ disabledCategories: [...categories] }),
    onExecuted: executed.on,
    onExecutionFailed: executionFailed.on,
    // ── host lens ──
    matchStroke: (stroke: KeyStroke, options) => {
      for (const entry of definedCommands()) {
        if (entry.parsed.some((shortcut) => matchShortcut(shortcut, stroke, options))) {
          return entry.definition.id;
        }
      }
      return null;
    },
    getMenuTarget: (id) => {
      const entry = entryOf(id);
      return entry ? { menu: entry.definition.menu } : null;
    },
  };

  return { api };
}
