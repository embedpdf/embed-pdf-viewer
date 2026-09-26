/**
 * @embedpdf/plugin-commands/contract — the command registry that toolbars,
 * menus, contextual strips, shortcuts and the palette all project. The plugin
 * ships ZERO commands (mechanism here, definitions in the product — the same
 * split as plugin-i18n's locale packs).
 *
 * Command state is a pure DERIVATION over the store: `resolveCommand` reads
 * other capabilities' selectors at call time, so any store change is
 * reflected on the next read and the framework binding's one change stream
 * makes every consumer reactive. Definitions hold functions, so they live in
 * the plugin's registry, never in the store; store state is only the
 * serializable `disabledCategories`.
 */
import type {
  CapabilityToken,
  CoreState,
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
  core(): CoreState;
  /** Resolve a capability; document-scoped tokens bind to the target document. */
  get<T>(token: CapabilityToken<T>): T;
  /** Like `get`, but null when unavailable (no provider / no document). */
  tryGet<T>(token: CapabilityToken<T>): T | null;
}

/**
 * Up to two theme colors accompanying a command's icon — typed FACTS any
 * renderer can interpret (tint a glyph's slots, show a swatch), never
 * renderer props. The registry carries it the way it carries `icon`: as
 * data it doesn't interpret. Deliberately NOT v2's `iconProps` bag —
 * renderer-specific needs live app-side, joined by command id.
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
  readonly iconAccent?: (ctx: CommandContext) => IconAccent | null;
  /** 'Mod+K' style (ui-core grammar). Multiple bindings allowed. */
  readonly shortcut?: string | readonly string[];
  /** Feature-gating tags: a disabled category hides its commands everywhere. */
  readonly categories?: readonly string[];

  // ── declarative surface targets ──────────────────────────────────────────
  // A command that opens chrome DECLARES what it opens instead of doing it
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
  readonly enabled?: (ctx: CommandContext) => boolean;
  readonly active?: (ctx: CommandContext) => boolean;
  readonly visible?: (ctx: CommandContext) => boolean;

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

/** Value equality over resolved commands — `resolve()` mints a fresh object
 *  per read, so reactive bindings memo by value to re-render on real change. */
export const resolvedCommandsEqual = (
  a: ResolvedCommand | null,
  b: ResolvedCommand | null,
): boolean => {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.id === b.id &&
    a.label === b.label &&
    a.icon === b.icon &&
    // by value: resolve() mints a fresh accent object each read
    a.iconAccent?.primary === b.iconAccent?.primary &&
    a.iconAccent?.secondary === b.iconAccent?.secondary &&
    a.menu === b.menu &&
    a.enabled === b.enabled &&
    a.active === b.active &&
    a.visible === b.visible &&
    a.shortcuts.length === b.shortcuts.length &&
    a.shortcuts.every((s, i) => s === b.shortcuts[i])
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
  /** Add a command; the remover unregisters it. A duplicate id throws `conflict` unless `replace`. */
  registerCommand(def: CommandDef, options?: RegisterCommandOptions): Unsubscribe;
  registerCommands(defs: readonly CommandDef[], options?: RegisterCommandOptions): Unsubscribe;
  hasCommand(id: CommandId): boolean;
  getCommand(id: CommandId): CommandDef | null;
  listCommandIds(): readonly CommandId[];

  // ── resolution (pure reads; reactive through the store) ──
  /** Label, icon, enabled, active, visible for a target document. Reference-stable while unchanged. */
  resolveCommand(id: CommandId, documentId?: string): ResolvedCommand | null;
  /** Every command resolved. Reference-stable while unchanged. */
  listCommands(documentId?: string): readonly ResolvedCommand[];
  /** Palette query: visible commands whose resolved label or id matches. */
  searchCommands(query: string, documentId?: string): readonly ResolvedCommand[];
  /** Every binding, for a keyboard help sheet. */
  listShortcuts(): readonly { commandId: CommandId; shortcut: string }[];

  // ── execution (the ONLY path; guarded by enabled/visible) ──
  /** Run a command; settles after `run` does. A refused command resolves `rejected` with its reason. */
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
  readonly onExecuted: EventHook<CommandExecutedEvent>;
  readonly onExecutionFailed: EventHook<CommandExecutionFailedEvent>;
}
