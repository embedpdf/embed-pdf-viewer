import {
  BasePlugin,
  Listener,
  PluginRegistry,
  Unsubscribe,
  createBehaviorEmitter,
  createEmitter,
  createScopedEmitter,
} from '@embedpdf/core';
import { I18nCapability, I18nPlugin } from '@embedpdf/plugin-i18n';
import {
  UICapability,
  UIPluginConfig,
  UIState,
  UIScope,
  UISchema,
  UIDocumentState,
  ToolbarChangedData,
  ToolbarChangedEvent,
  PanelChangedData,
  PanelChangedEvent,
  ModalChangedData,
  ModalChangedEvent,
  MenuChangedData,
  MenuChangedEvent,
} from './types';
import {
  UIAction,
  initUIState,
  cleanupUIState,
  setActiveToolbar,
  closeToolbarSlot,
  setActivePanel,
  closePanelSlot,
  setPanelTab,
  openModal,
  closeModal,
  openMenu,
  closeMenu,
  closeAllMenus,
  setDisabledCategories,
} from './actions';
import { mergeUISchema } from './utils/schema-merger';
import { generateUIStylesheet, StylesheetConfig } from './utils';

export class UIPlugin extends BasePlugin<UIPluginConfig, UICapability, UIState, UIAction> {
  static readonly id = 'ui' as const;

  private schema: UISchema;
  private stylesheetConfig: StylesheetConfig;

  // Stylesheet caching with locale awareness
  private cachedStylesheet: string | null = null;
  private cachedLocale: string | null = null;

  // Optional i18n integration
  private i18n: I18nCapability | null = null;
  private i18nCleanup: (() => void) | null = null;

  // Events
  private readonly categoryChanged$ = createBehaviorEmitter<{ disabledCategories: string[] }>();
  private readonly stylesheetInvalidated$ = createEmitter<void>();

  private readonly toolbarChanged$ = createScopedEmitter<
    ToolbarChangedData,
    ToolbarChangedEvent,
    string
  >((documentId, data) => ({ documentId, ...data }), { cache: false });

  private readonly panelChanged$ = createScopedEmitter<PanelChangedData, PanelChangedEvent, string>(
    (documentId, data) => ({ documentId, ...data }),
    { cache: false },
  );

  private readonly modalChanged$ = createScopedEmitter<ModalChangedData, ModalChangedEvent, string>(
    (documentId, data) => ({ documentId, ...data }),
    { cache: false },
  );

  private readonly menuChanged$ = createScopedEmitter<MenuChangedData, MenuChangedEvent, string>(
    (documentId, data) => ({ documentId, ...data }),
    { cache: false },
  );

  constructor(id: string, registry: PluginRegistry, config: UIPluginConfig) {
    super(id, registry);
    this.schema = config.schema;
    this.stylesheetConfig = config.stylesheetConfig || {};

    // Initialize disabled categories from config
    if (config.disabledCategories?.length) {
      this.dispatch(setDisabledCategories(config.disabledCategories));
    }

    this.i18n = registry.getPlugin<I18nPlugin>('i18n')?.provides() ?? null;

    if (this.i18n) {
      this.i18nCleanup = this.i18n.onLocaleChange(({ currentLocale }) => {
        this.handleLocaleChange(currentLocale);
      });

      // Initialize cached locale
      this.cachedLocale = this.i18n.getLocale();
    }
  }

  async initialize(): Promise<void> {
    this.logger.info('UIPlugin', 'Initialize', 'UI plugin initialized');
  }

  async destroy(): Promise<void> {
    if (this.i18nCleanup) {
      this.i18nCleanup();
      this.i18nCleanup = null;
    }

    this.toolbarChanged$.clear();
    this.panelChanged$.clear();
    this.modalChanged$.clear();
    this.menuChanged$.clear();
    this.stylesheetInvalidated$.clear();
    super.destroy();
  }

  protected override onDocumentLoadingStarted(documentId: string): void {
    this.dispatch(initUIState(documentId, this.schema));
  }

  protected override onDocumentClosed(documentId: string): void {
    this.dispatch(cleanupUIState(documentId));

    // Clear scoped emitters
    this.toolbarChanged$.clearScope(documentId);
    this.panelChanged$.clearScope(documentId);
    this.modalChanged$.clearScope(documentId);
    this.menuChanged$.clearScope(documentId);
  }

  /**
   * Handle locale changes from i18n plugin.
   * Invalidates stylesheet and emits change event.
   */
  private handleLocaleChange(newLocale: string): void {
    if (this.cachedLocale === newLocale) return;

    this.logger.debug(
      'UIPlugin',
      'LocaleChange',
      `Locale changed: ${this.cachedLocale} -> ${newLocale}`,
    );

    this.cachedLocale = newLocale;
    this.invalidateStylesheet();
    this.stylesheetInvalidated$.emit();
  }

  /**
   * Get the generated CSS stylesheet.
   * Automatically regenerates if locale has changed.
   * This is pure logic - DOM injection is handled by framework layer.
   */
  public getStylesheet(): string {
    const currentLocale = this.i18n?.getLocale() ?? null;

    // Check if we need to regenerate
    if (this.cachedStylesheet && this.cachedLocale === currentLocale) {
      return this.cachedStylesheet;
    }

    // Generate new stylesheet
    this.cachedStylesheet = generateUIStylesheet(this.schema, {
      config: this.stylesheetConfig,
      locale: currentLocale ?? undefined,
    });
    this.cachedLocale = currentLocale;

    return this.cachedStylesheet;
  }

  /**
   * Get the current locale (if i18n is available)
   */
  public getLocale(): string | null {
    return this.i18n?.getLocale() ?? null;
  }

  /**
   * Regenerate stylesheet (call after schema changes)
   */
  public invalidateStylesheet(): void {
    this.cachedStylesheet = null;
  }

  public onStylesheetInvalidated(listener: Listener<void>): Unsubscribe {
    return this.stylesheetInvalidated$.on(listener);
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

  // ─────────────────────────────────────────────────────────
  // Capability
  // ─────────────────────────────────────────────────────────

  protected buildCapability(): UICapability {
    return {
      // Active document operations
      setActiveToolbar: (placement, slot, toolbarId, documentId) =>
        this.setToolbarForDocument(placement, slot, toolbarId, documentId),
      setActivePanel: (placement, slot, panelId, documentId, activeTab) =>
        this.setPanelForDocument(placement, slot, panelId, documentId, activeTab),
      togglePanel: (placement, slot, panelId, documentId, activeTab) =>
        this.togglePanelForDocument(placement, slot, panelId, documentId, activeTab),
      openModal: (modalId, documentId) => this.openModalForDocument(modalId, documentId),
      openMenu: (menuId, triggeredByCommandId, triggeredByItemId, documentId) =>
        this.openMenuForDocument(menuId, triggeredByCommandId, triggeredByItemId, documentId),
      toggleMenu: (menuId, triggeredByCommandId, triggeredByItemId, documentId) =>
        this.toggleMenuForDocument(menuId, triggeredByCommandId, triggeredByItemId, documentId),

      // Document-scoped operations
      forDocument: (documentId) => this.createUIScope(documentId),

      // Schema
      getSchema: () => this.schema,
      mergeSchema: (partial) => {
        this.schema = mergeUISchema(this.schema, partial);
      },

      // Category management
      disableCategory: (category) => this.disableCategoryImpl(category),
      enableCategory: (category) => this.enableCategoryImpl(category),
      toggleCategory: (category) => this.toggleCategoryImpl(category),
      setDisabledCategories: (categories) => this.setDisabledCategoriesImpl(categories),
      getDisabledCategories: () => this.state.disabledCategories,
      isCategoryDisabled: (category) => this.state.disabledCategories.includes(category),

      // Events
      onToolbarChanged: this.toolbarChanged$.onGlobal,
      onPanelChanged: this.panelChanged$.onGlobal,
      onModalChanged: this.modalChanged$.onGlobal,
      onMenuChanged: this.menuChanged$.onGlobal,
      onCategoryChanged: this.categoryChanged$.on,
    };
  }

  // ─────────────────────────────────────────────────────────
  // Document Scoping
  // ─────────────────────────────────────────────────────────

  private createUIScope(documentId: string): UIScope {
    return {
      // ───── Toolbars ─────
      setActiveToolbar: (placement, slot, toolbarId) =>
        this.setToolbarForDocument(placement, slot, toolbarId, documentId),
      getActiveToolbar: (placement, slot) =>
        this.getToolbarForDocument(placement, slot, documentId),
      closeToolbarSlot: (placement, slot) =>
        this.closeToolbarForDocument(placement, slot, documentId),
      isToolbarOpen: (placement, slot, toolbarId) =>
        this.isToolbarOpenForDocument(placement, slot, toolbarId, documentId),

      // ───── Panels ─────
      setActivePanel: (placement, slot, panelId, activeTab) =>
        this.setPanelForDocument(placement, slot, panelId, documentId, activeTab),
      getActivePanel: (placement, slot) => this.getPanelForDocument(placement, slot, documentId),
      closePanelSlot: (placement, slot) => this.closePanelForDocument(placement, slot, documentId),
      togglePanel: (placement, slot, panelId, activeTab) =>
        this.togglePanelForDocument(placement, slot, panelId, documentId, activeTab),
      isPanelOpen: (placement, slot, panelId) =>
        this.isPanelOpenForDocument(placement, slot, panelId, documentId),

      // ───── Panel tabs ─────
      setPanelTab: (panelId, tabId) => this.setPanelTabForDocument(panelId, tabId, documentId),
      getPanelTab: (panelId) => this.getPanelTabForDocument(panelId, documentId),

      // ───── Modals ─────
      openModal: (modalId) => this.openModalForDocument(modalId, documentId),
      closeModal: () => this.closeModalForDocument(documentId),
      getActiveModal: () => this.getActiveModalForDocument(documentId),

      // ───── Menus ─────
      openMenu: (menuId, triggeredByCommandId, triggeredByItemId) =>
        this.openMenuForDocument(menuId, triggeredByCommandId, triggeredByItemId, documentId),
      closeMenu: (menuId) => this.closeMenuForDocument(menuId, documentId),
      toggleMenu: (menuId, triggeredByCommandId, triggeredByItemId) =>
        this.toggleMenuForDocument(menuId, triggeredByCommandId, triggeredByItemId, documentId),
      closeAllMenus: () => this.closeAllMenusForDocument(documentId),
      isMenuOpen: (menuId) => this.isMenuOpenForDocument(menuId, documentId),
      getOpenMenus: () => this.getOpenMenusForDocument(documentId),

      // ───── Schema & state ─────
      getSchema: () => this.schema,
      getState: () => this.getDocumentStateOrThrow(documentId),

      // ───── Scoped events ─────
      onToolbarChanged: this.toolbarChanged$.forScope(documentId),
      onPanelChanged: this.panelChanged$.forScope(documentId),
      onModalChanged: this.modalChanged$.forScope(documentId),
      onMenuChanged: this.menuChanged$.forScope(documentId),
    };
  }

  // ─────────────────────────────────────────────────────────
  // State Helpers
  // ─────────────────────────────────────────────────────────

  private getDocumentState(documentId?: string): UIDocumentState | null {
    const id = documentId ?? this.getActiveDocumentId();
    return this.state.documents[id] ?? null;
  }

  private getDocumentStateOrThrow(documentId?: string): UIDocumentState {
    const state = this.getDocumentState(documentId);
    if (!state) {
      throw new Error(`UI state not found for document: ${documentId ?? 'active'}`);
    }
    return state;
  }

  // ─────────────────────────────────────────────────────────
  // Core Operations - Toolbars
  // ─────────────────────────────────────────────────────────

  private setToolbarForDocument(
    placement: string,
    slot: string,
    toolbarId: string,
    documentId?: string,
  ): void {
    const id = documentId ?? this.getActiveDocumentId();
    this.dispatch(setActiveToolbar(id, placement, slot, toolbarId));
    this.toolbarChanged$.emit(id, { placement, slot, toolbarId });
  }

  private getToolbarForDocument(
    placement: string,
    slot: string,
    documentId?: string,
  ): string | null {
    const slotKey = `${placement}-${slot}`;
    const toolbarSlot = this.getDocumentStateOrThrow(documentId).activeToolbars[slotKey];
    return toolbarSlot?.isOpen ? toolbarSlot.toolbarId : null;
  }

  private closeToolbarForDocument(placement: string, slot: string, documentId?: string): void {
    const id = documentId ?? this.getActiveDocumentId();
    this.dispatch(closeToolbarSlot(id, placement, slot));
    this.toolbarChanged$.emit(id, { placement, slot, toolbarId: '' });
  }

  private isToolbarOpenForDocument(
    placement: string,
    slot: string,
    toolbarId?: string,
    documentId?: string,
  ): boolean {
    const slotKey = `${placement}-${slot}`;
    const toolbarSlot = this.getDocumentStateOrThrow(documentId).activeToolbars[slotKey];
    if (!toolbarSlot || !toolbarSlot.isOpen) return false;
    return toolbarId ? toolbarSlot.toolbarId === toolbarId : true;
  }

  // ─────────────────────────────────────────────────────────
  // Core Operations - Panels
  // ─────────────────────────────────────────────────────────

  private setPanelForDocument(
    placement: string,
    slot: string,
    panelId: string,
    documentId?: string,
    activeTab?: string,
  ): void {
    const id = documentId ?? this.getActiveDocumentId();
    this.dispatch(setActivePanel(id, placement, slot, panelId, activeTab));
    this.panelChanged$.emit(id, { placement, slot, panelId });
  }

  private getPanelForDocument(placement: string, slot: string, documentId?: string): string | null {
    const slotKey = `${placement}-${slot}`;
    const panelSlot = this.getDocumentStateOrThrow(documentId).activePanels[slotKey];
    return panelSlot?.isOpen ? panelSlot.panelId : null;
  }

  private closePanelForDocument(placement: string, slot: string, documentId?: string): void {
    const id = documentId ?? this.getActiveDocumentId();
    this.dispatch(closePanelSlot(id, placement, slot));
    this.panelChanged$.emit(id, { placement, slot, panelId: '' });
  }

  private togglePanelForDocument(
    placement: string,
    slot: string,
    panelId: string,
    documentId?: string,
    activeTab?: string,
  ): void {
    const id = documentId ?? this.getActiveDocumentId();
    const slotKey = `${placement}-${slot}`;
    const panelSlot = this.getDocumentStateOrThrow(id).activePanels[slotKey];

    if (panelSlot?.panelId === panelId && panelSlot?.isOpen) {
      this.dispatch(closePanelSlot(id, placement, slot));
      this.panelChanged$.emit(id, { placement, slot, panelId: '' });
    } else {
      this.dispatch(setActivePanel(id, placement, slot, panelId, activeTab));
      this.panelChanged$.emit(id, { placement, slot, panelId });
    }
  }

  private isPanelOpenForDocument(
    placement: string,
    slot: string,
    panelId?: string,
    documentId?: string,
  ): boolean {
    const slotKey = `${placement}-${slot}`;
    const panelSlot = this.getDocumentStateOrThrow(documentId).activePanels[slotKey];
    if (!panelSlot || !panelSlot.isOpen) return false;
    return panelId ? panelSlot.panelId === panelId : true;
  }

  // ─────────────────────────────────────────────────────────
  // Core Operations - Panel Tabs
  // ─────────────────────────────────────────────────────────

  private setPanelTabForDocument(panelId: string, tabId: string, documentId?: string): void {
    const id = documentId ?? this.getActiveDocumentId();
    this.dispatch(setPanelTab(id, panelId, tabId));
  }

  private getPanelTabForDocument(panelId: string, documentId?: string): string | null {
    return this.getDocumentStateOrThrow(documentId).panelTabs[panelId] ?? null;
  }

  // ─────────────────────────────────────────────────────────
  // Core Operations - Modals
  // ─────────────────────────────────────────────────────────

  private openModalForDocument(modalId: string, documentId?: string): void {
    const id = documentId ?? this.getActiveDocumentId();
    this.dispatch(openModal(id, modalId));
    this.modalChanged$.emit(id, { modalId });
  }

  private closeModalForDocument(documentId?: string): void {
    const id = documentId ?? this.getActiveDocumentId();
    this.dispatch(closeModal(id));
    this.modalChanged$.emit(id, { modalId: null });
  }

  private getActiveModalForDocument(documentId?: string): string | null {
    return this.getDocumentStateOrThrow(documentId).activeModal;
  }

  // ─────────────────────────────────────────────────────────
  // Core Operations - Menus
  // ─────────────────────────────────────────────────────────

  private openMenuForDocument(
    menuId: string,
    triggeredByCommandId?: string,
    triggeredByItemId?: string,
    documentId?: string,
  ): void {
    const id = documentId ?? this.getActiveDocumentId();
    this.dispatch(openMenu(id, { menuId, triggeredByCommandId, triggeredByItemId }));
    this.menuChanged$.emit(id, { menuId, isOpen: true });
  }

  private closeMenuForDocument(menuId: string, documentId?: string): void {
    const id = documentId ?? this.getActiveDocumentId();
    this.dispatch(closeMenu(id, menuId));
    this.menuChanged$.emit(id, { menuId, isOpen: false });
  }

  private toggleMenuForDocument(
    menuId: string,
    triggeredByCommandId?: string,
    triggeredByItemId?: string,
    documentId?: string,
  ): void {
    const id = documentId ?? this.getActiveDocumentId();
    const isOpen = !!this.getDocumentStateOrThrow(id).openMenus[menuId];

    if (isOpen) {
      this.dispatch(closeMenu(id, menuId));
      this.menuChanged$.emit(id, { menuId, isOpen: false });
    } else {
      this.dispatch(openMenu(id, { menuId, triggeredByCommandId, triggeredByItemId }));
      this.menuChanged$.emit(id, { menuId, isOpen: true });
    }
  }

  private closeAllMenusForDocument(documentId?: string): void {
    const id = documentId ?? this.getActiveDocumentId();
    this.dispatch(closeAllMenus(id));
  }

  private isMenuOpenForDocument(menuId: string, documentId?: string): boolean {
    return !!this.getDocumentStateOrThrow(documentId).openMenus[menuId];
  }

  private getOpenMenusForDocument(documentId?: string): Array<{
    menuId: string;
    triggeredByCommandId?: string;
    triggeredByItemId?: string;
  }> {
    return Object.values(this.getDocumentStateOrThrow(documentId).openMenus);
  }
}
