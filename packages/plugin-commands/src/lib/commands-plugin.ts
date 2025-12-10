import {
  BasePlugin,
  PluginRegistry,
  StoreState,
  createEmitter,
  createBehaviorEmitter,
  Listener,
  arePropsEqual,
} from '@embedpdf/core';
import { I18nCapability, I18nPlugin } from '@embedpdf/plugin-i18n';
import {
  CommandsCapability,
  CommandsPluginConfig,
  CommandsState,
  Command,
  ResolvedCommand,
  CommandExecutedEvent,
  CommandStateChangedEvent,
  ShortcutExecutedEvent,
  CategoryChangedEvent,
  CommandScope,
  Dynamic,
} from './types';
import { CommandsAction, setDisabledCategories } from './actions';

export class CommandsPlugin extends BasePlugin<
  CommandsPluginConfig,
  CommandsCapability,
  CommandsState,
  CommandsAction
> {
  static readonly id = 'commands' as const;

  private commands = new Map<string, Command>();
  private i18n: I18nCapability | null = null;
  private shortcutMap = new Map<string, string>(); // shortcut -> commandId

  private readonly commandExecuted$ = createEmitter<CommandExecutedEvent>();
  private readonly commandStateChanged$ = createEmitter<CommandStateChangedEvent>();
  private readonly shortcutExecuted$ = createEmitter<ShortcutExecutedEvent>();
  private readonly categoryChanged$ = createBehaviorEmitter<CategoryChangedEvent>();

  // Cache previous resolved states per document to detect changes
  private previousStates = new Map<string, Map<string, ResolvedCommand>>();

  constructor(id: string, registry: PluginRegistry, config: CommandsPluginConfig) {
    super(id, registry);

    // Check if i18n plugin is available (optional dependency)
    const i18nPlugin = registry.getPlugin<I18nPlugin>('i18n');
    this.i18n = i18nPlugin?.provides() ?? null;

    // Initialize disabled categories from config
    if (config.disabledCategories?.length) {
      this.dispatch(setDisabledCategories(config.disabledCategories));
    }

    // Register all commands from config
    Object.values(config.commands).forEach((command) => {
      this.registerCommand(command);
    });

    // Subscribe to global store changes
    this.registry.getStore().subscribe((_action, newState) => {
      this.onGlobalStoreChange(newState);
    });
  }

  protected override onDocumentClosed(documentId: string): void {
    // Cleanup previous states cache
    this.previousStates.delete(documentId);

    this.logger.debug(
      'CommandsPlugin',
      'DocumentClosed',
      `Cleaned up command state cache for document: ${documentId}`,
    );
  }

  async initialize(): Promise<void> {
    this.logger.info('CommandsPlugin', 'Initialize', 'Commands plugin initialized');
  }

  async destroy(): Promise<void> {
    this.commandExecuted$.clear();
    this.commandStateChanged$.clear();
    this.shortcutExecuted$.clear();
    this.categoryChanged$.clear();
    this.commands.clear();
    this.shortcutMap.clear();
    this.previousStates.clear();
    super.destroy();
  }

  // ─────────────────────────────────────────────────────────
  // Category Management
  // ─────────────────────────────────────────────────────────

  private disableCategoryImpl(category: string): void {
    const current = new Set(this.state.disabledCategories);
    if (!current.has(category)) {
      current.add(category);
      this.dispatch(setDisabledCategories(Array.from(current)));
      this.categoryChanged$.emit({ disabledCategories: Array.from(current) });
    }
  }

  private enableCategoryImpl(category: string): void {
    const current = new Set(this.state.disabledCategories);
    if (current.has(category)) {
      current.delete(category);
      this.dispatch(setDisabledCategories(Array.from(current)));
      this.categoryChanged$.emit({ disabledCategories: Array.from(current) });
    }
  }

  private toggleCategoryImpl(category: string): void {
    if (this.state.disabledCategories.includes(category)) {
      this.enableCategoryImpl(category);
    } else {
      this.disableCategoryImpl(category);
    }
  }

  private setDisabledCategoriesImpl(categories: string[]): void {
    this.dispatch(setDisabledCategories(categories));
    this.categoryChanged$.emit({ disabledCategories: categories });
  }

  /**
   * Check if command has any disabled category
   */
  private isCommandCategoryDisabled(command: Command): boolean {
    if (!command.categories?.length) return false;
    return command.categories.some((cat) => this.state.disabledCategories.includes(cat));
  }

  // ─────────────────────────────────────────────────────────
  // Capability
  // ─────────────────────────────────────────────────────────

  protected buildCapability(): CommandsCapability {
    return {
      resolve: (commandId, documentId) => this.resolve(commandId, documentId),
      execute: (commandId, documentId, source = 'ui') =>
        this.execute(commandId, documentId, source),
      getAllCommands: (documentId) => this.getAllCommands(documentId),
      getCommandsByCategory: (category, documentId) =>
        this.getCommandsByCategory(category, documentId),
      getCommandByShortcut: (shortcut) => this.getCommandByShortcut(shortcut),
      getAllShortcuts: () => new Map(this.shortcutMap),
      forDocument: (documentId) => this.createCommandScope(documentId),
      registerCommand: (command) => this.registerCommand(command),
      unregisterCommand: (commandId) => this.unregisterCommand(commandId),

      // Category management
      disableCategory: (category) => this.disableCategoryImpl(category),
      enableCategory: (category) => this.enableCategoryImpl(category),
      toggleCategory: (category) => this.toggleCategoryImpl(category),
      setDisabledCategories: (categories) => this.setDisabledCategoriesImpl(categories),
      getDisabledCategories: () => this.state.disabledCategories,
      isCategoryDisabled: (category) => this.state.disabledCategories.includes(category),

      // Events
      onCommandExecuted: this.commandExecuted$.on,
      onCommandStateChanged: this.commandStateChanged$.on,
      onShortcutExecuted: this.shortcutExecuted$.on,
      onCategoryChanged: this.categoryChanged$.on,
    };
  }

  // ─────────────────────────────────────────────────────────
  // Document Scoping
  // ─────────────────────────────────────────────────────────

  private createCommandScope(documentId: string): CommandScope {
    return {
      resolve: (commandId) => this.resolve(commandId, documentId),
      execute: (commandId, source = 'ui') => this.execute(commandId, documentId, source),
      getAllCommands: () => this.getAllCommands(documentId),
      getCommandsByCategory: (category) => this.getCommandsByCategory(category, documentId),
      onCommandStateChanged: (listener: Listener<Omit<CommandStateChangedEvent, 'documentId'>>) =>
        this.commandStateChanged$.on((event) => {
          if (event.documentId === documentId) {
            const { documentId: _, ...rest } = event;
            listener(rest);
          }
        }),
    };
  }

  // ─────────────────────────────────────────────────────────
  // Command Resolution
  // ─────────────────────────────────────────────────────────

  private resolve(commandId: string, documentId?: string): ResolvedCommand {
    const resolvedDocId = documentId ?? this.getActiveDocumentId();

    const command = this.commands.get(commandId);
    if (!command) {
      throw new Error(`Command not found: ${commandId}`);
    }

    const state = this.registry.getStore().getState();

    // Resolve label with i18n if available
    const label = this.resolveLabel(command, state, resolvedDocId);

    // Resolve shortcuts
    const shortcuts = command.shortcuts
      ? Array.isArray(command.shortcuts)
        ? command.shortcuts
        : [command.shortcuts]
      : undefined;

    // Check if disabled via categories OR explicit disabled predicate
    const explicitDisabled = this.resolveDynamic(command.disabled, state, resolvedDocId) ?? false;
    const categoryDisabled = this.isCommandCategoryDisabled(command);
    const isDisabled = explicitDisabled || categoryDisabled;

    return {
      id: command.id,
      label,
      icon: this.resolveDynamic(command.icon, state, resolvedDocId),
      iconProps: this.resolveDynamic(command.iconProps, state, resolvedDocId),
      active: this.resolveDynamic(command.active, state, resolvedDocId) ?? false,
      disabled: isDisabled,
      visible: this.resolveDynamic(command.visible, state, resolvedDocId) ?? true,
      shortcuts,
      shortcutLabel: command.shortcutLabel,
      categories: command.categories,
      description: command.description,
      execute: () => command.action({ registry: this.registry, state, documentId: resolvedDocId }),
    };
  }

  private resolveLabel(command: Command, state: StoreState<any>, documentId: string): string {
    // Priority: labelKey (with i18n) > label (plain string) > id (fallback)
    if (command.labelKey && this.i18n) {
      const params = this.resolveDynamic(command.labelParams, state, documentId);
      return this.i18n.t(command.labelKey, { params, documentId });
    }

    if (command.label) {
      return command.label;
    }

    return command.id; // Fallback to ID
  }

  private resolveDynamic<T>(
    value: Dynamic<any, T> | undefined,
    state: StoreState<any>,
    documentId: string,
  ): T | undefined {
    if (value === undefined) return undefined;

    // Check if it's a function (the dynamic evaluator)
    if (typeof value === 'function') {
      return (value as (context: { state: StoreState<any>; documentId: string }) => T)({
        state,
        documentId,
      });
    }

    // Otherwise it's the static value
    return value as T;
  }

  // ─────────────────────────────────────────────────────────
  // Command Execution
  // ─────────────────────────────────────────────────────────

  private execute(
    commandId: string,
    documentId?: string,
    source: 'keyboard' | 'ui' | 'api' = 'ui',
  ): void {
    const resolvedDocId = documentId ?? this.getActiveDocumentId();
    const resolved = this.resolve(commandId, resolvedDocId);

    if (resolved.disabled) {
      this.logger.warn(
        'CommandsPlugin',
        'ExecutionBlocked',
        `Command '${commandId}' is disabled for document '${resolvedDocId}'`,
      );
      return;
    }

    if (!resolved.visible) {
      this.logger.warn(
        'CommandsPlugin',
        'ExecutionBlocked',
        `Command '${commandId}' is not visible for document '${resolvedDocId}'`,
      );
      return;
    }

    resolved.execute();

    this.commandExecuted$.emit({
      commandId,
      documentId: resolvedDocId,
      source,
    });

    this.logger.debug(
      'CommandsPlugin',
      'CommandExecuted',
      `Command '${commandId}' executed for document '${resolvedDocId}' (source: ${source})`,
    );
  }

  // ─────────────────────────────────────────────────────────
  // Command Registration
  // ─────────────────────────────────────────────────────────

  private registerCommand(command: Command): void {
    if (this.commands.has(command.id)) {
      this.logger.warn(
        'CommandsPlugin',
        'CommandOverwrite',
        `Command '${command.id}' already exists and will be overwritten`,
      );
    }

    this.commands.set(command.id, command);

    // Register shortcuts
    if (command.shortcuts) {
      const shortcuts = Array.isArray(command.shortcuts) ? command.shortcuts : [command.shortcuts];

      shortcuts.forEach((shortcut) => {
        const normalized = this.normalizeShortcut(shortcut);
        this.shortcutMap.set(normalized, command.id);
      });
    }

    this.logger.debug('CommandsPlugin', 'CommandRegistered', `Command '${command.id}' registered`);
  }

  private unregisterCommand(commandId: string): void {
    const command = this.commands.get(commandId);
    if (!command) return;

    // Remove shortcuts
    if (command.shortcuts) {
      const shortcuts = Array.isArray(command.shortcuts) ? command.shortcuts : [command.shortcuts];

      shortcuts.forEach((shortcut) => {
        const normalized = this.normalizeShortcut(shortcut);
        this.shortcutMap.delete(normalized);
      });
    }

    this.commands.delete(commandId);
    this.logger.debug(
      'CommandsPlugin',
      'CommandUnregistered',
      `Command '${commandId}' unregistered`,
    );
  }

  // ─────────────────────────────────────────────────────────
  // Shortcuts
  // ─────────────────────────────────────────────────────────

  private getCommandByShortcut(shortcut: string): Command | null {
    const normalized = this.normalizeShortcut(shortcut);
    const commandId = this.shortcutMap.get(normalized);
    return commandId ? (this.commands.get(commandId) ?? null) : null;
  }

  private normalizeShortcut(shortcut: string): string {
    // Normalize: "Ctrl+Shift+A" -> "ctrl+shift+a"
    return shortcut.toLowerCase().split('+').sort().join('+');
  }

  // ─────────────────────────────────────────────────────────
  // Query Methods
  // ─────────────────────────────────────────────────────────

  private getAllCommands(documentId?: string): ResolvedCommand[] {
    const resolvedDocId = documentId ?? this.getActiveDocumentId();
    return Array.from(this.commands.keys()).map((id) => this.resolve(id, resolvedDocId));
  }

  private getCommandsByCategory(category: string, documentId?: string): ResolvedCommand[] {
    const resolvedDocId = documentId ?? this.getActiveDocumentId();
    return Array.from(this.commands.values())
      .filter((cmd) => cmd.categories?.includes(category))
      .map((cmd) => this.resolve(cmd.id, resolvedDocId));
  }

  // ─────────────────────────────────────────────────────────
  // State Change Detection
  // ─────────────────────────────────────────────────────────

  private onGlobalStoreChange(newState: StoreState<any>): void {
    // Get all documents from core state
    const documentIds = Object.keys(newState.core.documents);

    // Check each document for command state changes
    documentIds.forEach((documentId) => {
      this.detectCommandChanges(documentId, newState);
    });
  }

  private detectCommandChanges(documentId: string, newState: StoreState<any>): void {
    const previousCache = this.previousStates.get(documentId) ?? new Map();
    const changedCommandIds: string[] = [];

    this.commands.forEach((command, commandId) => {
      const newResolved = this.resolve(commandId, documentId);
      const prevResolved = previousCache.get(commandId);

      if (!prevResolved) {
        // First time resolving for this document
        previousCache.set(commandId, newResolved);
        return;
      }

      // Check for changes
      const changes: CommandStateChangedEvent['changes'] = {};

      if (prevResolved.active !== newResolved.active) {
        changes.active = newResolved.active;
      }
      if (prevResolved.disabled !== newResolved.disabled) {
        changes.disabled = newResolved.disabled;
      }
      if (prevResolved.visible !== newResolved.visible) {
        changes.visible = newResolved.visible;
      }
      if (prevResolved.label !== newResolved.label) {
        changes.label = newResolved.label;
      }
      if (!arePropsEqual(prevResolved.iconProps, newResolved.iconProps)) {
        changes.iconProps = newResolved.iconProps;
      }

      if (Object.keys(changes).length > 0) {
        changedCommandIds.push(commandId);
        previousCache.set(commandId, newResolved);

        this.commandStateChanged$.emit({
          commandId,
          documentId,
          changes,
        });
      }
    });

    this.previousStates.set(documentId, previousCache);
  }
}
