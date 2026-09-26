/**
 * @embedpdf/plugin-commands/contract — the command registry that toolbars,
 * menus, contextual strips, shortcuts and the palette all project. The plugin
 * ships no commands (mechanism here, definitions in the product — the same
 * split as plugin-i18n's locale packs).
 *
 * Command state is a derivation over live state: `resolveCommand` reads other
 * capabilities at call time, so any store change is reflected on the next
 * read and the framework binding's one change stream makes every consumer
 * reactive. Definitions hold functions, so they live in the plugin's
 * registry, never in the store; registering or removing one wakes readers.
 * State is only the serializable `disabledCategories`.
 */
import type {
  CapabilityToken,
  EventHook,
  OperationOptions,
  PluginErrorInfo,
  Unsubscribe,
} from '@embedpdf/core';

export { CommandsToken } from './token';

export type CommandId = string;

/** What a derivation or `run` sees: capability resolution bound to the
 *  command's target document (explicit, else the active one). */
export interface CommandContext {
  /** The target document, or null when no document is open. */
  readonly documentId: string | null;
  /** Caller-supplied arguments (`execute(id, { args })`). */
  readonly args?: unknown;
  /** Resolve a capability; document-scoped tokens bind to the target document
   *  (`DocumentsToken` reads the document registry). */
  get<T>(token: CapabilityToken<T>): T;
  /** Like `get`, but null when unavailable (no provider / no document). */
  tryGet<T>(token: CapabilityToken<T>): T | null;
}

/**
 * Up to two theme colors accompanying a command's icon — typed facts any
 * renderer can interpret (tint a glyph's slots, show a swatch), never
 * renderer props. The registry carries it the way it carries `icon`: as
 * data it doesn't interpret. Renderer-specific needs live app-side, joined
 * by command id.
 */
export interface IconAccent {
  /** The mark: stroke / markup / font color. */
  readonly primary?: string;
  /** The fill, when there is one. */
  readonly secondary?: string;
}

export interface CommandDef {
  /** Convention: 'domain:verb' — 'zoom:in', 'mode:annotate', 'panel:search'. */
  readonly id: string;
  /** i18n key, resolved through I18nToken when present (else shown verbatim). */
  readonly labelKey: string;
  readonly icon?: string;
  /** Live color accent for the icon (a tool previewing its drawing defaults).
   *  A pure derivation over the store, exactly like `active`/`enabled`. */
  readonly iconAccent?: (context: CommandContext) => IconAccent | null;
  /** 'Mod+K' style (ui-core grammar). Multiple bindings allowed. */
  readonly shortcut?: string | readonly string[];
  /** Feature-gating tags: a disabled category hides its commands everywhere. */
  readonly categories?: readonly string[];

  // ── declarative surface targets ──────────────────────────────────────────
  // A command that opens chrome declares what it opens instead of doing it
  // imperatively. This is load-bearing: buttons render carets/aria-haspopup,
  // `active` derives automatically from the surface's open state, and the
  // overflow projection renders `menu` targets as nested submenus.
  /** Toggles a named dropdown menu (a MenuSchema id in the app's chrome). */
  readonly menu?: string;
  /** Toggles a named shell surface, optionally exclusive within a tag ('left'…). */
  readonly panel?: string | { readonly id: string; readonly exclusive?: string };
  /** Toggles a modal surface (exclusive within the built-in 'modal' tag). */
  readonly modal?: string;

  // ── pure derivations over the store ──────────────────────────────────────
  readonly enabled?: (context: CommandContext) => boolean;
  readonly active?: (context: CommandContext) => boolean;
  readonly visible?: (context: CommandContext) => boolean;

  /** The verb. Optional for pure surface-target commands. Runs before the
   *  default target routing when both are present; `execute` settles after it. */
  readonly run?: (context: CommandContext) => void | Promise<unknown>;
}

/** A command as a renderer sees it — everything resolved for the target document. */
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
}

/**
 * Value equality over resolved commands, for bindings that compare what a
 * command looks like rather than which object holds it (a group of commands,
 * or resolutions against different documents).
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
    left.shortcuts.length === right.shortcuts.length &&
    left.shortcuts.every((shortcut, index) => shortcut === right.shortcuts[index])
  );
};

export interface CommandsConfig {
  /** The app's command definitions (content — the plugin ships none). */
  commands?: readonly CommandDef[];
  /** Categories disabled at startup (host feature-gating). */
  disabledCategories?: readonly string[];
}

export interface RegisterCommandOptions {
  /** Replace an existing definition with the same id (otherwise a duplicate rejects `conflict`). */
  replace?: boolean;
}

export type ExecuteResult =
  | { status: 'executed' }
  | { status: 'rejected'; reason: 'not-found' | 'disabled' | 'hidden' };

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

export interface CommandsCapability {
  // ── registry ──
  /**
   * Add a command and wake readers; the remover unregisters it (and wakes
   * them again). A duplicate id throws `conflict` unless `replace`.
   */
  registerCommand(definition: CommandDef, options?: RegisterCommandOptions): Unsubscribe;
  /** `registerCommand` for several definitions; the remover unregisters all of them. */
  registerCommands(
    definitions: readonly CommandDef[],
    options?: RegisterCommandOptions,
  ): Unsubscribe;
  hasCommand(id: CommandId): boolean;
  getCommand(id: CommandId): CommandDef | null;
  /** Registered ids in registration order. Reference-stable until the registry changes. */
  listCommandIds(): readonly CommandId[];

  // ── resolution (pure reads; reactive through the store) ──
  /** Label, icon, enabled, active, visible for a target document. Reference-stable while unchanged. */
  resolveCommand(id: CommandId, documentId?: string): ResolvedCommand | null;
  /** Every command resolved. Reference-stable while unchanged. */
  listCommands(documentId?: string): readonly ResolvedCommand[];
  /** Palette query: visible commands whose resolved label or id matches. */
  searchCommands(query: string, documentId?: string): readonly ResolvedCommand[];
  /** Every binding, for a keyboard help sheet. Reference-stable until the registry changes. */
  listShortcuts(): readonly { commandId: CommandId; shortcut: string }[];

  // ── execution (the only path; guarded by enabled/visible) ──
  /**
   * Run a command; settles after `run` does. A refused command resolves
   * `rejected` with its reason. Fires `onExecuted` on success; a throwing
   * `run` fires `onExecutionFailed` and rejects with its `PluginError`.
   */
  execute(
    id: CommandId,
    options?: { documentId?: string; args?: unknown } & OperationOptions,
  ): Promise<ExecuteResult>;
  /** Enabled and visible for the target. */
  canExecute(id: CommandId, documentId?: string): boolean;

  // ── category gating ──
  getDisabledCategories(): readonly string[];
  isCategoryDisabled(category: string): boolean;
  disableCategory(category: string): void;
  enableCategory(category: string): void;
  setDisabledCategories(categories: readonly string[]): void;

  // ── events ──
  /** A command's `run` (or its surface routing) completed. */
  readonly onExecuted: EventHook<CommandExecutedEvent>;
  /** A command's `run` threw; `execute` rejects with the same error. */
  readonly onExecutionFailed: EventHook<CommandExecutionFailedEvent>;
}
