/**
 * The commands controller: the commands (from the settings, added while the
 * app runs, and from families), resolution for a document (derivations over
 * live state, safe to throw, asked once per store change), the one way to run
 * a command, turning commands off (by category and one by one), what the
 * session may run (the scope's `requires`, the plugins' checks in `allowed`),
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
import { ShellToken } from '@embedpdf/plugin-shell/contract';

import type {
  CommandContext,
  CommandDefinition,
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
import type { CommandsHostCapability, ShortcutMatch } from './host-contract';
import {
  configuredCommands,
  registeredCommand,
  type ConfiguredCommands,
  type RegisteredCommand,
} from './registry';
import {
  createAvailability,
  labelOf,
  labelParamsOf,
  lockedMessage,
  notAllowedMessage,
  translateOf,
  type Translate,
} from './services/availability';
import { createTurningOff } from './write/turning-off';

const panelTarget = (
  definition: CommandDefinition,
): { id: string; exclusive?: string; focus?: boolean } | null =>
  definition.panel === undefined
    ? null
    : typeof definition.panel === 'string'
      ? { id: definition.panel }
      : definition.panel;

/**
 * A toggle: it has an `active` of its own, or opens a panel. A menu's button says it's expanded
 * instead.
 */
const pressableOf = (definition: CommandDefinition): boolean =>
  !definition.menu && (definition.active !== undefined || definition.panel !== undefined);

/**
 * What one command's derivations answer for a document, as values a memo can compare: the
 * entry, the translate function and its label's `labelParams` (as JSON, so equal values compare
 * equal), the accent colors, the enabled/active/visible flags, and the keys of the sentences that
 * say why it's disabled: the scope doesn't allow it (when it shows disabled for that), or a lock
 * holds its setting. The label and the sentences are translated from these, only when one of them
 * changes.
 */
type Answers = readonly [
  entry: RegisteredCommand | null,
  translate: Translate | null,
  labelParams: string | undefined,
  accentPrimary: string | undefined,
  accentSecondary: string | undefined,
  enabled: boolean,
  active: boolean,
  visible: boolean,
  notAllowedKey: string | null,
  lockedKey: string | null,
];

const NOT_REGISTERED: Answers = [
  null,
  null,
  undefined,
  undefined,
  undefined,
  false,
  false,
  false,
  null,
  null,
];
const NO_NAMES: readonly string[] = [];

const accentOf = (primary?: string, secondary?: string): IconAccent | undefined =>
  primary === undefined && secondary === undefined
    ? undefined
    : {
        ...(primary !== undefined ? { primary } : {}),
        ...(secondary !== undefined ? { secondary } : {}),
      };

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
      appState: settings.get().appState,
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

  /**
   * The context a document's derivations read (`''` is the active document): the same object
   * until the store changes. It keeps the capabilities it finds, which stay the same objects
   * until then.
   */
  const contextByDocument = memoByKey(
    (_documentKey: string) => [ctx.storeChangeCount()],
    (documentKey): CommandContext => {
      const context = commandContext(documentKey || undefined);
      const found = new Map<CapabilityToken<unknown>, unknown>();
      const tryGet = <T>(token: CapabilityToken<T>): T | null => {
        if (!found.has(token)) found.set(token, context.tryGet(token));
        return found.get(token) as T | null;
      };
      return { ...context, tryGet, get: (token) => tryGet(token) ?? context.get(token) };
    },
  );

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

  // Derivations run against live state: without one, the command is what
  // `absent` says; one that throws (it needs a document and none is open, say)
  // says no, so the button renders disabled, not pressed or hidden instead of
  // breaking.
  const derive = (
    derivation: ((context: CommandContext) => boolean) | undefined,
    context: CommandContext,
    absent: boolean,
  ): boolean => {
    if (!derivation) return absent;
    try {
      return derivation(context);
    } catch {
      return false;
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

  const { isTurnedOff, notAllowedKeyOf, lockedKeyOf, refusalOf } = createAvailability(
    ctx,
    settings,
  );

  /** Whether a command shows as pressed: its `active`, else while what it opens is open. */
  const activeOf = (definition: CommandDefinition, context: CommandContext): boolean => {
    if (definition.active) return derive(definition.active, context, false);
    const shell = context.tryGet(ShellToken);
    if (!shell) return false;
    const panel = panelTarget(definition);
    return definition.menu
      ? shell.isMenuOpen(definition.menu)
      : panel
        ? shell.isOpen(panel.id)
        : definition.modal
          ? shell.isOpen(definition.modal)
          : false;
  };

  /**
   * Whether a command can run and whether it shows, as its derivations answer now, with the keys
   * of the sentences that say why it's disabled. Turned off hides it; not allowed hides it, or
   * disables it with the reason; a lock on the setting it changes disables it with the lock's
   * reason, whatever `notAllowed` says.
   */
  const availabilityOf = (definition: CommandDefinition, context: CommandContext) => {
    const turnedOff = isTurnedOff(definition);
    const notAllowed = turnedOff ? null : notAllowedKeyOf(definition, context);
    const shownWhenNotAllowed = settings.get().notAllowed === 'disable';
    const lockedKey = turnedOff || notAllowed !== null ? null : lockedKeyOf(definition, context);
    const ruledOut = turnedOff || notAllowed !== null || lockedKey !== null;
    return {
      enabled: !ruledOut && derive(definition.enabled, context, true),
      visible:
        !turnedOff &&
        (notAllowed === null || shownWhenNotAllowed) &&
        derive(definition.visible, context, true),
      notAllowedKey: shownWhenNotAllowed ? notAllowed : null,
      lockedKey,
    };
  };

  /** What a command's derivations answer for a document now. */
  const answersOf = (entry: RegisteredCommand, context: CommandContext): Answers => {
    const { definition } = entry;
    const { enabled, visible, notAllowedKey, lockedKey } = availabilityOf(definition, context);
    const labelParams = labelParamsOf(definition, context);
    const accent = deriveAccent(definition.iconAccent, context);
    return [
      entry,
      translateOf(context),
      labelParams === undefined ? undefined : JSON.stringify(labelParams),
      accent?.primary,
      accent?.secondary,
      enabled,
      activeOf(definition, context),
      visible,
      notAllowedKey,
      lockedKey,
    ];
  };

  /**
   * One document's commands as buttons show them, by id (`''` is the active document). A
   * command's derivations are asked at most once per store change, however many readers ask for
   * it; its resolved object is built again, label and sentences translated, only when one of their
   * answers changed.
   */
  const documentResolution = (documentKey: string) => {
    const answersById = memoByKey(
      (_id: string) => [ctx.storeChangeCount()],
      (id): Answers => {
        const entry = entryOf(id);
        return entry ? answersOf(entry, contextByDocument(documentKey)) : NOT_REGISTERED;
      },
    );
    return memoByKey(
      (id: string): Answers => answersById(id),
      (
        _id,
        entry,
        translate,
        labelParams,
        accentPrimary,
        accentSecondary,
        enabled,
        active,
        visible,
        notAllowedKey,
        lockedKey,
      ): ResolvedCommand | null => {
        if (!entry) return null;
        const params = labelParams === undefined ? undefined : JSON.parse(labelParams);
        const label = labelOf(entry.definition, params, translate);
        const disabledReason =
          notAllowedKey !== null
            ? notAllowedMessage(notAllowedKey, label, translate)
            : lockedKey !== null
              ? lockedMessage(lockedKey, label, translate)
              : undefined;
        return {
          id: entry.definition.id,
          label,
          icon: entry.definition.icon,
          iconAccent: accentOf(accentPrimary, accentSecondary),
          shortcuts: entry.shortcuts,
          menu: entry.definition.menu,
          enabled,
          active,
          pressable: pressableOf(entry.definition),
          visible,
          categories: entry.definition.categories ?? [],
          ...(disabledReason === undefined ? {} : { disabledReason }),
        };
      },
    );
  };
  /** Each document's resolution, made the first time the document is asked about. */
  const resolutionByDocument = memoByKey((_documentKey: string) => [], documentResolution);
  const resolveCommand = (id: string, documentId?: string): ResolvedCommand | null =>
    resolutionByDocument(documentId ?? '')(id);

  /**
   * Every command's id for a document (`''` is the active one): the defined ones in the order
   * they were added, then each family's names that no defined command took.
   */
  const idsByDocument = memoByKey(
    (documentKey: string): readonly unknown[] => {
      const config = configured();
      const context = contextByDocument(documentKey);
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
  const runCommand = async (
    definition: CommandDefinition,
    context: CommandContext,
  ): Promise<void> => {
    if (definition.run) {
      await definition.run(context);
      return;
    }
    const shell = context.tryGet(ShellToken);
    const panel = panelTarget(definition);
    if (!shell) return;
    if (definition.menu) shell.toggleMenu(definition.menu);
    else if (panel) shell.toggle(panel.id, { exclusive: panel.exclusive, focus: panel.focus });
    else if (definition.modal) shell.toggle(definition.modal, { exclusive: 'modal' });
  };

  const execute = async (id: string, options: ExecuteOptions = {}): Promise<ExecuteResult> => {
    const { signal, documentId, args } = options;
    if (signal?.aborted) {
      throw new PluginError('operation-cancelled', 'commands', 'operation cancelled');
    }
    const entry = entryOf(id);
    if (!entry) return { status: 'rejected', reason: 'not-found' };
    // Asked at this moment, not as of the last store change: a run goes by what the command
    // answers now, also when something outside the viewer changed it since.
    const now = availabilityOf(entry.definition, contextByDocument(documentId ?? ''));
    if (!now.visible) return { status: 'rejected', reason: 'hidden' };
    if (!now.enabled) return { status: 'rejected', reason: 'disabled' };
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
    } finally {
      // A run may change what the commands read outside the viewer (your app's state): every
      // button asks its command again, so the one just pressed shows what it did.
      ctx.notify();
    }
    executed.emit({ commandId: id, documentId: context.documentId, args });
    return { status: 'executed' };
  };

  const registerOne = (
    definition: CommandDefinition,
    options?: RegisterCommandOptions,
  ): Unsubscribe => {
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

  const turningOff = createTurningOff(
    settings,
    (id) => entryOf(id)?.definition ?? null,
    isTurnedOff,
  );

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
      const entry = entryOf(id);
      if (!entry) return false;
      const now = availabilityOf(entry.definition, contextByDocument(documentId ?? ''));
      return now.enabled && now.visible;
    },
    getRefusal: (id, documentId) => {
      const entry = entryOf(id);
      return entry ? refusalOf(entry.definition, contextByDocument(documentId ?? '')) : null;
    },
    ...turningOff,
    onExecuted: executed.on,
    onExecutionFailed: executionFailed.on,
    // ── host lens ──
    matchStroke: (stroke: KeyStroke, options) => {
      let waiting: ShortcutMatch | null = null;
      let refused: ShortcutMatch | null = null;
      for (const entry of definedCommands()) {
        if (options.inTextField && !entry.definition.shortcutInTextFields) continue;
        if (!entry.parsed.some((shortcut) => matchShortcut(shortcut, stroke, options))) continue;
        const context = contextByDocument('');
        const refusal = refusalOf(entry.definition, context);
        const visible = derive(entry.definition.visible, context, true);
        if (!refusal) {
          // Commands that share keys take turns: Escape cancels a drawing while there is one,
          // and lets a snapshot go while there is one.
          if (visible && derive(entry.definition.enabled, context, true)) {
            return { commandId: entry.definition.id, refusal: null };
          }
          waiting ??= { commandId: entry.definition.id, refusal: null };
          continue;
        }
        // A refused command takes its keys only where it would show: Delete with nothing
        // selected stays the page's, even where deleting is turned off.
        if (!visible) continue;
        refused ??= { commandId: entry.definition.id, refusal };
      }
      return waiting ?? refused;
    },
    getMenuTarget: (id) => {
      const entry = entryOf(id);
      return entry ? { menu: entry.definition.menu } : null;
    },
  };

  return { api };
}
