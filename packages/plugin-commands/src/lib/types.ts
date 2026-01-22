import { BasePluginConfig, CoreState, EventHook } from '@embedpdf/core';
import { PluginRegistry } from '@embedpdf/core';
import { TranslationKey } from '@embedpdf/plugin-i18n';

export type Dynamic<TStore, T> =
  | T
  | ((context: { registry: PluginRegistry; state: TStore; documentId: string }) => T);

export interface IconProps {
  primaryColor?: string;
  secondaryColor?: string;
  className?: string;
  title?: string;
}

export interface Command<TStore = any> {
  id: string;

  // Labels - support both i18n and plain strings
  label?: string; // Plain string (used if no i18n)
  labelKey?: Dynamic<TStore, TranslationKey>; // i18n key (takes precedence if i18n available), can be dynamic
  labelParams?: Dynamic<TStore, Record<string, string | number>>; // Dynamic params for interpolation

  // Icon
  icon?: Dynamic<TStore, string>;
  iconProps?: Dynamic<TStore, IconProps>;

  // Execution - receives context object
  action: (context: { registry: PluginRegistry; state: TStore; documentId: string }) => void;

  // State predicates - ALWAYS receive documentId
  active?: Dynamic<TStore, boolean>;
  disabled?: Dynamic<TStore, boolean>;
  visible?: Dynamic<TStore, boolean>;

  // Keyboard shortcuts - can be single or multiple
  shortcuts?: string | string[];
  shortcutLabel?: string; // Display label for shortcuts

  // Metadata - commands can belong to multiple categories
  categories?: string[];
  description?: string;
}

export interface ResolvedCommand {
  id: string;
  label: string; // Always resolved (translated if possible)
  icon?: string;
  iconProps?: IconProps;
  active: boolean;
  disabled: boolean;
  visible: boolean;
  shortcuts?: string[];
  shortcutLabel?: string;
  categories?: string[];
  description?: string;
  execute: () => void; // Pre-bound to documentId
}

export interface GlobalStoreState<TPlugins extends Record<string, any> = {}> {
  core: CoreState;
  plugins: TPlugins;
}

export interface CommandsPluginConfig extends BasePluginConfig {
  commands: Record<string, Command>;
  /** Categories to disable at initialization */
  disabledCategories?: string[];
}

export interface CommandsState {
  /** Globally disabled command categories */
  disabledCategories: string[];
}

// Events
export interface CommandExecutedEvent {
  commandId: string;
  documentId: string;
  source: 'keyboard' | 'ui' | 'api';
}

export interface CommandStateChangedEvent {
  commandId: string;
  documentId: string;
  changes: {
    active?: boolean;
    disabled?: boolean;
    visible?: boolean;
    label?: string;
    icon?: string;
    iconProps?: IconProps;
  };
}

export interface ShortcutExecutedEvent {
  shortcut: string;
  commandId: string;
  documentId: string;
}

export interface CategoryChangedEvent {
  disabledCategories: string[];
}

export interface CommandScope {
  resolve(commandId: string): ResolvedCommand;
  execute(commandId: string, source?: 'keyboard' | 'ui' | 'api'): void;
  getAllCommands(): ResolvedCommand[];
  getCommandsByCategory(category: string): ResolvedCommand[];
  onCommandStateChanged: EventHook<Omit<CommandStateChangedEvent, 'documentId'>>;
}

export interface CommandsCapability {
  // Active document operations
  resolve(commandId: string, documentId?: string): ResolvedCommand;
  execute(commandId: string, documentId?: string, source?: 'keyboard' | 'ui' | 'api'): void;
  getAllCommands(documentId?: string): ResolvedCommand[];
  getCommandsByCategory(category: string, documentId?: string): ResolvedCommand[];

  // Shortcut lookup
  getCommandByShortcut(shortcut: string): Command | null;
  getAllShortcuts(): Map<string, string>; // shortcut -> commandId

  // Document-scoped operations
  forDocument(documentId: string): CommandScope;

  // Registration (for dynamic commands)
  registerCommand(command: Command): void;
  unregisterCommand(commandId: string): void;

  // Category management
  disableCategory(category: string): void;
  enableCategory(category: string): void;
  toggleCategory(category: string): void;
  setDisabledCategories(categories: string[]): void;
  getDisabledCategories(): string[];
  isCategoryDisabled(category: string): boolean;

  // Global events
  onCommandExecuted: EventHook<CommandExecutedEvent>;
  onCommandStateChanged: EventHook<CommandStateChangedEvent>;
  onShortcutExecuted: EventHook<ShortcutExecutedEvent>;
  onCategoryChanged: EventHook<CategoryChangedEvent>;
}
