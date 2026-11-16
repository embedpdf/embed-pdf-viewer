/**
 * @embedpdf/plugin-commands/contract — the commands that toolbars, menus,
 * shortcuts and a command palette all show and run.
 *
 * A command's state is read from live state: `resolveCommand` asks the other
 * capabilities again after each store change (once, however many readers
 * ask), so every reader follows the kernel's one change stream, with no
 * events. Definitions hold functions, so they live in the settings and the
 * plugin's registry, never in state.
 */
import type {
  CommandDefinition,
  CommandFamily,
  DeepPartial,
  EventHook,
  IconAccent,
  OperationOptions,
  PluginErrorInfo,
  SettingsApi,
  Unsubscribe,
} from '@embedpdf/core';
import { didYouMean, formatShortcut } from '@embedpdf/core-ui';

export { CommandsToken } from './token';

export type CommandId = string;

// What a command is lives in core, so a plugin can ship commands without
// depending on this one.
export type { CommandContext, CommandDefinition, CommandFamily, IconAccent } from '@embedpdf/core';

/** A command as a button shows it: everything read for its document. */
export interface ResolvedCommand {
  readonly id: string;
  readonly label: string;
  readonly icon?: string;
  readonly iconAccent?: IconAccent;
  readonly shortcuts: readonly string[];
  readonly menu?: string;
  readonly enabled: boolean;
  readonly active: boolean;
  /**
   * Whether it's a toggle, pressed while `active`: it has an `active` of its own, or opens a panel.
   * Its button says `aria-pressed`, true or false; another button leaves it off. A command that
   * opens a menu or a dialog isn't one.
   */
  readonly pressable: boolean;
  readonly visible: boolean;
  readonly categories: readonly string[];
  /**
   * Why it's disabled, as a sentence for its tooltip: set when the scope doesn't allow it and
   * the `notAllowed` setting is `'disable'`, or when a lock holds the setting it changes.
   */
  readonly disabledReason?: string;
}

/**
 * Why a command won't run whatever the moment: it's turned off in this viewer
 * (`disabledCategories`, `disabledCommands`), the scope doesn't allow it (`requires`), or a lock
 * holds the setting it changes (`locked`). A command that only can't run right now (`enabled`,
 * `visible`) has no refusal.
 */
export interface CommandRefusal {
  readonly reason: 'turned-off' | 'not-allowed' | 'locked';
  /** A sentence for the user, translated through the i18n plugin when it's there. */
  readonly message: string;
}

/**
 * Whether two resolved commands show the same, for readers that compare what a command looks
 * like rather than which object holds it (a group of commands, or one command for two documents).
 */
export const resolvedCommandsEqual = (
  left: ResolvedCommand | null,
  right: ResolvedCommand | null,
): boolean => {
  if (left === right) return true;
  if (!left || !right) return false;
  return (
    left.id === right.id &&
    left.label === right.label &&
    left.icon === right.icon &&
    left.iconAccent?.primary === right.iconAccent?.primary &&
    left.iconAccent?.secondary === right.iconAccent?.secondary &&
    left.menu === right.menu &&
    left.enabled === right.enabled &&
    left.active === right.active &&
    left.pressable === right.pressable &&
    left.visible === right.visible &&
    left.disabledReason === right.disabledReason &&
    left.shortcuts.length === right.shortcuts.length &&
    left.shortcuts.every((shortcut, index) => shortcut === right.shortcuts[index])
  );
};

/**
 * What a component or a toolbar draws for a command id no plugin registered: labelled with its
 * id, neither enabled nor visible, the way a turned-off command is.
 */
export const unregisteredCommand = (id: CommandId): ResolvedCommand => ({
  id,
  label: id,
  shortcuts: [],
  enabled: false,
  active: false,
  pressable: false,
  visible: false,
  categories: [],
});

/** What a component that asks for an id no plugin registered hears, in development. */
export const unknownCommandWarning = (id: CommandId, known: Iterable<CommandId>): string =>
  `no command "${id}"${didYouMean(id, known)}: it shows as neither visible nor enabled`;

/** A command with everything a button needs: what it shows, `run`, and its shortcut for a tooltip. */
export interface BoundCommand extends ResolvedCommand {
  /** Run the command for the document it was read for. */
  readonly run: () => Promise<ExecuteResult>;
  /** Its first shortcut, formatted for the platform (`'⌘K'` on a Mac, `'Ctrl+K'` elsewhere), or `null`. */
  readonly shortcutLabel: string | null;
}

/**
 * A resolved command, bound for a button: `run` executes it through `execute`, and
 * `shortcutLabel` is its first shortcut formatted for the platform. Which platform is the
 * caller's to know (`isMacPlatform()` in `@embedpdf/web`).
 */
export function boundCommandOf(
  command: ResolvedCommand,
  execute: (id: CommandId) => Promise<ExecuteResult>,
  options: { readonly isMac: boolean },
): BoundCommand {
  const [first] = command.shortcuts;
  return {
    ...command,
    run: () => execute(command.id),
    shortcutLabel: first === undefined ? null : formatShortcut(first, { isMac: options.isMac }),
  };
}

/**
 * The commands plugin's settings. `commandsPlugin(config)` registers them over
 * {@link COMMANDS_DEFAULTS}, and `updateSettings()` changes them while the app runs.
 */
export interface CommandsSettings {
  /** The commands your viewer has. A later definition with an id that's taken replaces the earlier one. */
  readonly commands: readonly (CommandDefinition | CommandFamily)[];
  /**
   * Your app's state, which every command's functions get as `appState`: values, and functions
   * that change them. A new value replaces the old one whole, and every command is asked again.
   */
  readonly appState: unknown;
  /**
   * Categories turned off, with every category under them: their commands are hidden and
   * refused wherever they appear.
   */
  readonly disabledCategories: readonly string[];
  /** Commands turned off one by one, by id: hidden and refused wherever they appear. */
  readonly disabledCommands: readonly CommandId[];
  /**
   * What a command the scope doesn't allow does: `'hide'` leaves it out, `'disable'` shows it
   * disabled, with the reason in its `disabledReason`.
   */
  readonly notAllowed: NotAllowedMode;
}

/** How a command shows when the scope doesn't allow it: hidden, or disabled with its reason. */
export type NotAllowedMode = 'hide' | 'disable';

/** What the commands settings are when the app registers none. */
export const COMMANDS_DEFAULTS: CommandsSettings = {
  commands: [],
  appState: undefined,
  disabledCategories: [],
  disabledCommands: [],
  notAllowed: 'hide',
};

/** What `commandsPlugin(config)` takes: any of the settings, merged over the defaults. */
export type CommandsConfig<AppState = any> = Omit<
  DeepPartial<CommandsSettings>,
  'commands' | 'appState'
> & {
  readonly commands?: readonly (CommandDefinition<AppState> | CommandFamily)[];
  readonly appState?: AppState;
};

export interface RegisterCommandOptions {
  /** Replace a command with the same id; without it, a taken id throws `conflict`. */
  replace?: boolean;
}

export interface ExecuteOptions extends OperationOptions {
  /** The document to run it for; the document in scope, else the active one, when left out. */
  documentId?: string;
  /** Passed to the command's `run` and derivations as `args`. */
  args?: unknown;
}

/** How `execute()` went: it ran, or it was refused before running, and why. */
export type ExecuteResult =
  | { readonly status: 'executed' }
  | { readonly status: 'rejected'; readonly reason: 'not-found' | 'disabled' | 'hidden' };

// ── events ──
export interface CommandExecutedEvent {
  readonly commandId: CommandId;
  readonly documentId: string | null;
  readonly args: unknown;
}
export interface CommandExecutionFailedEvent {
  readonly commandId: CommandId;
  readonly documentId: string | null;
  readonly error: PluginErrorInfo;
}

/**
 * The commands. A call that leaves out the document is for the document in scope when the
 * capability was resolved for one (`ctx.forDocument`, a `<DocumentScope>`), and for the active
 * document otherwise.
 */
export interface CommandsCapability extends SettingsApi<CommandsSettings> {
  // ── the commands ──
  /**
   * Add a command while the app runs, and get a function that removes it. A taken id throws
   * `conflict` unless `replace`.
   */
  registerCommand(definition: CommandDefinition, options?: RegisterCommandOptions): Unsubscribe;
  /** `registerCommand` for several definitions; the function removes all of them. */
  registerCommands(
    definitions: readonly CommandDefinition[],
    options?: RegisterCommandOptions,
  ): Unsubscribe;
  /** Whether a command has this id; with a family, every id that starts with its prefix does. */
  hasCommand(id: CommandId): boolean;
  /** A command as you defined it, or `null`. */
  getCommand(id: CommandId): CommandDefinition | null;
  /** Every command's id for the active document, in the order they were added. The same array until one changes. */
  listCommandIds(): readonly CommandId[];

  // ── what a button shows ──
  /** A command as a button shows it, or `null` for an unknown id. The same object while nothing about it changed. */
  resolveCommand(id: CommandId, documentId?: string): ResolvedCommand | null;
  /** Every command, resolved, in the order they were added. The same array while nothing changed. */
  listCommands(documentId?: string): readonly ResolvedCommand[];
  /** The visible commands whose label or id contains the query, for a command palette. */
  searchCommands(query: string, documentId?: string): readonly ResolvedCommand[];
  /** Every shortcut with its command, for a keyboard help sheet. The same array until the commands change. */
  listShortcuts(): readonly { readonly commandId: CommandId; readonly shortcut: string }[];

  // ── running them ──
  /**
   * Run a command; resolves once its `run` has, with `{ status: 'executed' }` and
   * `onExecuted`, or `{ status: 'rejected', reason }` for a command that is unknown, hidden or
   * disabled (a command turned off is hidden). A `run` that throws fires `onExecutionFailed` and rejects with its `PluginError`;
   * the signal rejects `operation-cancelled`.
   */
  execute(id: CommandId, options?: ExecuteOptions): Promise<ExecuteResult>;
  /** Whether a command can run now: it exists, and is enabled and visible. */
  canExecute(id: CommandId, documentId?: string): boolean;
  /**
   * Why a command won't run whatever the moment: it's turned off, or not allowed for its
   * document. `null` when it may run (or only can't right now), and for an unknown id.
   */
  getRefusal(id: CommandId, documentId?: string): CommandRefusal | null;

  // ── turning commands off ──
  /** The categories turned off. */
  getDisabledCategories(): readonly string[];
  /** Whether a category is turned off: it, or a category it's under (`annotations` for `annotations.highlight`). */
  isCategoryDisabled(category: string): boolean;
  /** Turn a category off, with every category under it: the `disabledCategories` setting gains it. */
  disableCategory(category: string): void;
  /** Turn a category on again. */
  enableCategory(category: string): void;
  /** Replace the categories that are off. */
  setDisabledCategories(categories: readonly string[]): void;
  /** The commands turned off one by one. */
  getDisabledCommands(): readonly CommandId[];
  /** Whether a command is turned off: by its id, or through one of its categories. */
  isCommandDisabled(id: CommandId): boolean;
  /** Turn one command off: the `disabledCommands` setting gains it. */
  disableCommand(id: CommandId): void;
  /** Turn a command on again; it stays off while one of its categories is. */
  enableCommand(id: CommandId): void;
  /** Replace the commands that are off one by one. */
  setDisabledCommands(ids: readonly CommandId[]): void;

  // ── events ──
  /** A command ran. */
  readonly onExecuted: EventHook<CommandExecutedEvent>;
  /** A command's `run` threw; `execute` rejects with the same error. */
  readonly onExecutionFailed: EventHook<CommandExecutionFailedEvent>;
}
