/**
 * @embedpdf/plugin-commands/contract — the commands that toolbars, menus,
 * shortcuts and a command palette all show and run.
 *
 * A command's state is read from live state: `resolveCommand` asks the other
 * capabilities when it's called, so every reader follows the kernel's one
 * change stream, with no events. Definitions hold functions, so they live in
 * the settings and the plugin's registry, never in state.
 */
import type {
  CapabilityToken,
  DeepPartial,
  EventHook,
  OperationOptions,
  Permission,
  PluginErrorInfo,
  SettingsApi,
  Unsubscribe,
} from '@embedpdf/core';
import { formatShortcut } from '@embedpdf/core-ui';

export { CommandsToken } from './token';

export type CommandId = string;

/**
 * What a command's derivations and `run` see: capabilities resolved for the command's document
 * (the one named, else the document in scope, else the active one).
 */
export interface CommandContext {
  /** The command's document, or `null` when none is open. */
  readonly documentId: string | null;
  /** What the caller passed: `execute(id, { args })`. */
  readonly args?: unknown;
  /** Fires when the caller cancels `execute()`: pass it on to the calls `run` makes. */
  readonly signal?: AbortSignal;
  /** A capability, for the command's document when the plugin is document-scoped. Throws when it isn't available. */
  get<T>(token: CapabilityToken<T>): T;
  /** Like `get`, but `null` when the capability isn't available (no plugin, no document). */
  tryGet<T>(token: CapabilityToken<T>): T | null;
}

/**
 * Up to two colors that go with a command's icon, such as a tool's current color: data a
 * renderer may use (tint the icon, show a swatch), like `icon` itself.
 */
export interface IconAccent {
  /** The mark: a stroke, the markup or the text color. */
  readonly primary?: string;
  /** The fill, when there is one. */
  readonly secondary?: string;
}

/** One command, as you define it. */
export interface CommandDef {
  /** A unique name, by convention `area:action`: `'zoom:in'`, `'review:approve'`. */
  readonly id: string;
  /** What the user sees. With `labelKey` too, it's what shows when no language has the key. */
  readonly label?: string;
  /**
   * A translation key for the label, read through the i18n plugin. Without the plugin, or a
   * string for the key, the command shows `label`, else the key.
   */
  readonly labelKey?: string;
  /** Your icon's name; your buttons turn it into an icon. */
  readonly icon?: string;
  /** Colors for the icon, read from live state like `active`. */
  readonly iconAccent?: (context: CommandContext) => IconAccent | null;
  /** A key such as `'Mod+K'` (`Mod` is Cmd on a Mac, Ctrl elsewhere), or a list of them. */
  readonly shortcut?: string | readonly string[];
  /**
   * The features it belongs to, so turning one off turns it off: `['annotations.highlight']`.
   * Turning off a feature turns off every feature under it, on whole dotted parts: `annotations`
   * covers `annotations.highlight`, not `annotationsExtra`.
   */
  readonly categories?: readonly string[];
  /**
   * The scope permissions it needs, such as `'doc.annotate.modify'`, checked against its
   * document. Without them it's hidden, or shown disabled with its reason under the
   * `notAllowed: 'disable'` setting. With no document open there is nothing to check.
   */
  readonly requires?: readonly Permission[];

  // ── what the command opens ───────────────────────────────────────────────
  // A command that opens a panel, menu or dialog says so instead of opening
  // it in `run`: it then needs no `run`, it shows as active while the surface
  // is open, and a button can show that it opens a menu.
  /** Opens and closes a menu of yours, by its id. */
  readonly menu?: string;
  /** Opens and closes a panel, closing the others with the same `exclusive` tag. */
  readonly panel?: string | { readonly id: string; readonly exclusive?: string };
  /** Opens and closes a dialog; one dialog is open at a time. */
  readonly modal?: string;

  // ── read from live state, again whenever anything changes ────────────────
  /** When it can run. Default: always. */
  readonly enabled?: (context: CommandContext) => boolean;
  /** When it shows as pressed, such as the current tool. */
  readonly active?: (context: CommandContext) => boolean;
  /** When it shows at all. Default: always. */
  readonly visible?: (context: CommandContext) => boolean;

  /** What it does; `execute()` resolves once it has. Not needed for a `menu`, `panel` or `modal`. */
  readonly run?: (context: CommandContext) => void | Promise<unknown>;
}

/**
 * A command for each of a set of names, made from one definition, such as `tool:<id>` for every
 * tool a document has. Its commands resolve and run like any other, and `listCommands()` lists
 * one per name. A command defined with the same id wins over the family's.
 */
export interface CommandFamily {
  /** Where the commands' ids start: `'tool:'` makes `tool:highlight`. */
  readonly prefix: string;
  /** The names the command's document has, in order. Return the same array while nothing changed. */
  readonly names: (context: CommandContext) => readonly string[];
  /** The command for one name. A family's commands have no shortcuts. */
  readonly command: (name: string) => Omit<CommandDef, 'id' | 'shortcut'>;
}

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
  readonly visible: boolean;
  readonly categories: readonly string[];
  /**
   * Why it's disabled, as a sentence for its tooltip: set when the scope doesn't allow it and
   * the `notAllowed` setting is `'disable'`.
   */
  readonly disabledReason?: string;
}

/**
 * Why a command won't run whatever the moment: it's turned off in this viewer
 * (`disabledCategories`, `disabledCommands`), or the scope doesn't allow it (`requires`).
 * A command that only can't run right now (`enabled`, `visible`) has no refusal.
 */
export interface CommandRefusal {
  readonly reason: 'turned-off' | 'not-allowed';
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
    left.visible === right.visible &&
    left.disabledReason === right.disabledReason &&
    left.shortcuts.length === right.shortcuts.length &&
    left.shortcuts.every((shortcut, index) => shortcut === right.shortcuts[index])
  );
};

/** What a toolbar draws for a command id no plugin registered: disabled, with its id as the label. */
export const unregisteredCommand = (id: CommandId): ResolvedCommand => ({
  id,
  label: id,
  shortcuts: [],
  enabled: false,
  active: false,
  visible: true,
  categories: [],
});

/** A command with everything a button needs: what it shows, `run`, and its shortcut for a tooltip. */
export interface BoundCommand extends ResolvedCommand {
  /** Run the command for the document it was read for. */
  readonly run: () => Promise<ExecuteResult>;
  /** Its first shortcut, formatted for the platform (`'⌘K'` on a Mac, `'Ctrl+K'` elsewhere), or `null`. */
  readonly shortcut: string | null;
}

/**
 * A resolved command, bound for a button: `run` executes it through `execute`, and `shortcut` is
 * its first shortcut formatted for the platform. Which platform is the caller's to know
 * (`isMacPlatform()` in `@embedpdf/web`).
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
    shortcut: first === undefined ? null : formatShortcut(first, { isMac: options.isMac }),
  };
}

/**
 * The commands plugin's settings. `commandsPlugin(config)` registers them over
 * {@link COMMANDS_DEFAULTS}, and `updateSettings()` changes them while the app runs.
 */
export interface CommandsSettings {
  /** The commands your viewer has. A later definition with an id that's taken replaces the earlier one. */
  readonly commands: readonly (CommandDef | CommandFamily)[];
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
  disabledCategories: [],
  disabledCommands: [],
  notAllowed: 'hide',
};

/** What `commandsPlugin(config)` takes: any of the settings, merged over the defaults. */
export type CommandsConfig = DeepPartial<CommandsSettings>;

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
  registerCommand(definition: CommandDef, options?: RegisterCommandOptions): Unsubscribe;
  /** `registerCommand` for several definitions; the function removes all of them. */
  registerCommands(
    definitions: readonly CommandDef[],
    options?: RegisterCommandOptions,
  ): Unsubscribe;
  /** Whether a command has this id; with a family, every id that starts with its prefix does. */
  hasCommand(id: CommandId): boolean;
  /** A command as you defined it, or `null`. */
  getCommand(id: CommandId): CommandDef | null;
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
