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
  SidebarChangedData,
  SidebarChangedEvent,
  ModalChangedData,
  ModalChangedEvent,
  MenuChangedData,
  MenuChangedEvent,
  OverlayChangedData,
  OverlayChangedEvent,
  ModalSlotState,
} from './types';
import {
  UIAction,
  initUIState,
  cleanupUIState,
  setActiveToolbar,
  closeToolbarSlot,
  setActiveSidebar,
  closeSidebarSlot,
  setSidebarTab,
  openModal,
  closeModal,
  clearModal,
  openMenu,
  closeMenu,
  closeAllMenus,
  setOverlayEnabled,
  setDisabledCategories,
  setHiddenItems,
} from './actions';
import { mergeUISchema } from './utils/schema-merger';
import {
  generateUIStylesheet,
  extractItemCategories,
  computeHiddenItems,
  StylesheetConfig,
} from './utils';

export class UIPlugin extends BasePlugin<UIPluginConfig, UICapability, UIState, UIAction> {
  static readonly id = 'ui' as const;

  private schema: UISchema;
  private stylesheetConfig: StylesheetConfig;

  // Item categories mapping for computing hidden items
  private itemCategories: Map<string, string[]>;

  // Stylesheet caching with locale awareness
  private cachedStylesheet: string | null = null;
  private cachedLocale: string | null = null;

  // Optional i18n integration
  private i18n: I18nCapability | null = null;
  private i18nCleanup: (() => void) | null = null;

  // Events
  private readonly categoryChanged$ = createBehaviorEmitter<{
    disabledCategories: string[];
    hiddenItems: string[];
  }>();
  private readonly stylesheetInvalidated$ = createEmitter<void>();

  private readonly toolbarChanged$ = createScopedEmitter<
    ToolbarChangedData,
    ToolbarChangedEvent,
    string
  >((documentId, data) => ({ documentId, ...data }), { cache: false });

  private readonly sidebarChanged$ = createScopedEmitter<
    SidebarChangedData,
    SidebarChangedEvent,
    string
  >((documentId, data) => ({ documentId, ...data }), { cache: false });

  private readonly modalChanged$ = createScopedEmitter<ModalChangedData, ModalChangedEvent, string>(
    (documentId, data) => ({ documentId, ...data }),
    { cache: false },
  );

  private readonly menuChanged$ = createScopedEmitter<MenuChangedData, MenuChangedEvent, string>(
    (documentId, data) => ({ documentId, ...data }),
    { cache: false },
  );

  private readonly overlayChanged$ = createScopedEmitter<
    OverlayChangedData,
    OverlayChangedEvent,
    string
  >((documentId, data) => ({ documentId, ...data }), { cache: false });

  constructor(id: string, registry: PluginRegistry, config: UIPluginConfig) {
    super(id, registry);
    this.schema = config.schema;
    this.stylesheetConfig = config.stylesheetConfig || {};

    // Extract item categories for computing hidden items
    this.itemCategories = extractItemCategories(this.schema);

    // Initialize disabled categories from config
    if (config.disabledCategories?.length) {
      this.dispatch(setDisabledCategories(config.disabledCategories));
      // Also compute and dispatch hidden items
      const hiddenItems = computeHiddenItems(this.itemCategories, config.disabledCategories);
      this.dispatch(setHiddenItems(hiddenItems));
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
    this.sidebarChanged$.clear();
    this.modalChanged$.clear();
    this.menuChanged$.clear();
    this.overlayChanged$.clear();
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
    this.sidebarChanged$.clearScope(documentId);
    this.modalChanged$.clearScope(documentId);
    this.menuChanged$.clearScope(documentId);
    this.overlayChanged$.clearScope(documentId);
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
      const categories = Array.from(current);
      this.dispatch(setDisabledCategories(categories));
      const hiddenItems = computeHiddenItems(this.itemCategories, categories);
      this.dispatch(setHiddenItems(hiddenItems));
      this.categoryChanged$.emit({ disabledCategories: categories, hiddenItems });
    }
  }

  private enableCategoryImpl(category: string): void {
    const current = new Set(this.state.disabledCategories);
    if (current.has(category)) {
      current.delete(category);
      const categories = Array.from(current);
      this.dispatch(setDisabledCategories(categories));
      const hiddenItems = computeHiddenItems(this.itemCategories, categories);
      this.dispatch(setHiddenItems(hiddenItems));
      this.categoryChanged$.emit({ disabledCategories: categories, hiddenItems });
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
    // Compute and dispatch hidden items based on disabled categories
    const hiddenItems = computeHiddenItems(this.itemCategories, categories);
    this.dispatch(setHiddenItems(hiddenItems));
    this.categoryChanged$.emit({ disabledCategories: categories, hiddenItems });
  }

  // ─────────────────────────────────────────────────────────
  // Capability
  // ─────────────────────────────────────────────────────────

  protected buildCapability(): UICapability {
    return {
      // Active document operations
      setActiveToolbar: (placement, slot, toolbarId, documentId) =>
        this.setToolbarForDocument(placement, slot, toolbarId, documentId),
      setActiveSidebar: (placement, slot, sidebarId, documentId, activeTab) =>
        this.setSidebarForDocument(placement, slot, sidebarId, documentId, activeTab),
      toggleSidebar: (placement, slot, sidebarId, documentId, activeTab) =>
        this.toggleSidebarForDocument(placement, slot, sidebarId, documentId, activeTab),
      openModal: (modalId, documentId) => this.openModalForDocument(modalId, documentId),
      openMenu: (menuId, triggeredByCommandId, triggeredByItemId, documentId) =>
        this.openMenuForDocument(menuId, triggeredByCommandId, triggeredByItemId, documentId),
      toggleMenu: (menuId, triggeredByCommandId, triggeredByItemId, documentId) =>
        this.toggleMenuForDocument(menuId, triggeredByCommandId, triggeredByItemId, documentId),

      // Overlay operations
      enableOverlay: (overlayId, documentId) =>
        this.enableOverlayForDocument(overlayId, documentId),
      disableOverlay: (overlayId, documentId) =>
        this.disableOverlayForDocument(overlayId, documentId),
      toggleOverlay: (overlayId, documentId) =>
        this.toggleOverlayForDocument(overlayId, documentId),

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
      getHiddenItems: () => this.state.hiddenItems,

      // Events
      onToolbarChanged: this.toolbarChanged$.onGlobal,
      onSidebarChanged: this.sidebarChanged$.onGlobal,
      onModalChanged: this.modalChanged$.onGlobal,
      onMenuChanged: this.menuChanged$.onGlobal,
      onOverlayChanged: this.overlayChanged$.onGlobal,
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

      // ───── Sidebars ─────
      setActiveSidebar: (placement, slot, sidebarId, activeTab) =>
        this.setSidebarForDocument(placement, slot, sidebarId, documentId, activeTab),
      getActiveSidebar: (placement, slot) =>
        this.getSidebarForDocument(placement, slot, documentId),
      closeSidebarSlot: (placement, slot) =>
        this.closeSidebarForDocument(placement, slot, documentId),
      toggleSidebar: (placement, slot, sidebarId, activeTab) =>
        this.toggleSidebarForDocument(placement, slot, sidebarId, documentId, activeTab),
      isSidebarOpen: (placement, slot, sidebarId) =>
        this.isSidebarOpenForDocument(placement, slot, sidebarId, documentId),

      // ───── Sidebar tabs ─────
      setSidebarTab: (sidebarId, tabId) =>
        this.setSidebarTabForDocument(sidebarId, tabId, documentId),
      getSidebarTab: (sidebarId) => this.getSidebarTabForDocument(sidebarId, documentId),

      // ───── Modals (with animation lifecycle) ─────
      openModal: (modalId) => this.openModalForDocument(modalId, documentId),
      closeModal: () => this.closeModalForDocument(documentId),
      clearModal: () => this.clearModalForDocument(documentId),
      getActiveModal: () => this.getActiveModalForDocument(documentId),
      isModalOpen: () => this.isModalOpenForDocument(documentId),

      // ───── Menus ─────
      openMenu: (menuId, triggeredByCommandId, triggeredByItemId) =>
        this.openMenuForDocument(menuId, triggeredByCommandId, triggeredByItemId, documentId),
      closeMenu: (menuId) => this.closeMenuForDocument(menuId, documentId),
      toggleMenu: (menuId, triggeredByCommandId, triggeredByItemId) =>
        this.toggleMenuForDocument(menuId, triggeredByCommandId, triggeredByItemId, documentId),
      closeAllMenus: () => this.closeAllMenusForDocument(documentId),
      isMenuOpen: (menuId) => this.isMenuOpenForDocument(menuId, documentId),
      getOpenMenus: () => this.getOpenMenusForDocument(documentId),

      // ───── Overlays ─────
      enableOverlay: (overlayId) => this.enableOverlayForDocument(overlayId, documentId),
      disableOverlay: (overlayId) => this.disableOverlayForDocument(overlayId, documentId),
      toggleOverlay: (overlayId) => this.toggleOverlayForDocument(overlayId, documentId),
      isOverlayEnabled: (overlayId) => this.isOverlayEnabledForDocument(overlayId, documentId),
      getEnabledOverlays: () => this.getEnabledOverlaysForDocument(documentId),

      // ───── Schema & state ─────
      getSchema: () => this.schema,
      getState: () => this.getDocumentStateOrThrow(documentId),

      // ───── Scoped events ─────
      onToolbarChanged: this.toolbarChanged$.forScope(documentId),
      onSidebarChanged: this.sidebarChanged$.forScope(documentId),
      onModalChanged: this.modalChanged$.forScope(documentId),
      onMenuChanged: this.menuChanged$.forScope(documentId),
      onOverlayChanged: this.overlayChanged$.forScope(documentId),
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
  // Core Operations - Sidebars
  // ─────────────────────────────────────────────────────────

  private setSidebarForDocument(
    placement: string,
    slot: string,
    sidebarId: string,
    documentId?: string,
    activeTab?: string,
  ): void {
    const id = documentId ?? this.getActiveDocumentId();
    this.dispatch(setActiveSidebar(id, placement, slot, sidebarId, activeTab));
    this.sidebarChanged$.emit(id, { placement, slot, sidebarId });
  }

  private getSidebarForDocument(
    placement: string,
    slot: string,
    documentId?: string,
  ): string | null {
    const slotKey = `${placement}-${slot}`;
    const sidebarSlot = this.getDocumentStateOrThrow(documentId).activeSidebars[slotKey];
    return sidebarSlot?.isOpen ? sidebarSlot.sidebarId : null;
  }

  private closeSidebarForDocument(placement: string, slot: string, documentId?: string): void {
    const id = documentId ?? this.getActiveDocumentId();
    this.dispatch(closeSidebarSlot(id, placement, slot));
    this.sidebarChanged$.emit(id, { placement, slot, sidebarId: '' });
  }

  private toggleSidebarForDocument(
    placement: string,
    slot: string,
    sidebarId: string,
    documentId?: string,
    activeTab?: string,
  ): void {
    const id = documentId ?? this.getActiveDocumentId();
    const slotKey = `${placement}-${slot}`;
    const sidebarSlot = this.getDocumentStateOrThrow(id).activeSidebars[slotKey];

    if (sidebarSlot?.sidebarId === sidebarId && sidebarSlot?.isOpen) {
      this.dispatch(closeSidebarSlot(id, placement, slot));
      this.sidebarChanged$.emit(id, { placement, slot, sidebarId: '' });
    } else {
      this.dispatch(setActiveSidebar(id, placement, slot, sidebarId, activeTab));
      this.sidebarChanged$.emit(id, { placement, slot, sidebarId });
    }
  }

  private isSidebarOpenForDocument(
    placement: string,
    slot: string,
    sidebarId?: string,
    documentId?: string,
  ): boolean {
    const slotKey = `${placement}-${slot}`;
    const sidebarSlot = this.getDocumentStateOrThrow(documentId).activeSidebars[slotKey];
    if (!sidebarSlot || !sidebarSlot.isOpen) return false;
    return sidebarId ? sidebarSlot.sidebarId === sidebarId : true;
  }

  // ─────────────────────────────────────────────────────────
  // Core Operations - Sidebar Tabs
  // ─────────────────────────────────────────────────────────

  private setSidebarTabForDocument(sidebarId: string, tabId: string, documentId?: string): void {
    const id = documentId ?? this.getActiveDocumentId();
    this.dispatch(setSidebarTab(id, sidebarId, tabId));
  }

  private getSidebarTabForDocument(sidebarId: string, documentId?: string): string | null {
    return this.getDocumentStateOrThrow(documentId).sidebarTabs[sidebarId] ?? null;
  }

  // ─────────────────────────────────────────────────────────
  // Core Operations - Modals (with animation lifecycle)
  // ─────────────────────────────────────────────────────────

  private openModalForDocument(modalId: string, documentId?: string): void {
    const id = documentId ?? this.getActiveDocumentId();
    this.dispatch(openModal(id, modalId));
    this.modalChanged$.emit(id, { modalId, isOpen: true });
  }

  private closeModalForDocument(documentId?: string): void {
    const id = documentId ?? this.getActiveDocumentId();
    const currentModal = this.getDocumentStateOrThrow(id).activeModal;
    this.dispatch(closeModal(id));
    this.modalChanged$.emit(id, { modalId: currentModal?.modalId ?? null, isOpen: false });
  }

  private clearModalForDocument(documentId?: string): void {
    const id = documentId ?? this.getActiveDocumentId();
    this.dispatch(clearModal(id));
  }

  private getActiveModalForDocument(documentId?: string): ModalSlotState | null {
    return this.getDocumentStateOrThrow(documentId).activeModal;
  }

  private isModalOpenForDocument(documentId?: string): boolean {
    const modal = this.getDocumentStateOrThrow(documentId).activeModal;
    return modal?.isOpen ?? false;
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

  // ─────────────────────────────────────────────────────────
  // Core Operations - Overlays
  // ─────────────────────────────────────────────────────────

  private enableOverlayForDocument(overlayId: string, documentId?: string): void {
    const id = documentId ?? this.getActiveDocumentId();
    this.dispatch(setOverlayEnabled(id, overlayId, true));
    this.overlayChanged$.emit(id, { overlayId, isEnabled: true });
  }

  private disableOverlayForDocument(overlayId: string, documentId?: string): void {
    const id = documentId ?? this.getActiveDocumentId();
    this.dispatch(setOverlayEnabled(id, overlayId, false));
    this.overlayChanged$.emit(id, { overlayId, isEnabled: false });
  }

  private toggleOverlayForDocument(overlayId: string, documentId?: string): void {
    const id = documentId ?? this.getActiveDocumentId();
    const isEnabled = this.isOverlayEnabledForDocument(overlayId, id);

    if (isEnabled) {
      this.disableOverlayForDocument(overlayId, id);
    } else {
      this.enableOverlayForDocument(overlayId, id);
    }
  }

  private isOverlayEnabledForDocument(overlayId: string, documentId?: string): boolean {
    const enabledOverlays = this.getDocumentStateOrThrow(documentId).enabledOverlays;
    // Default to true if not explicitly set (matches schema behavior)
    return enabledOverlays[overlayId] ?? true;
  }

  private getEnabledOverlaysForDocument(documentId?: string): string[] {
    const enabledOverlays = this.getDocumentStateOrThrow(documentId).enabledOverlays;
    return Object.entries(enabledOverlays)
      .filter(([, enabled]) => enabled)
      .map(([overlayId]) => overlayId);
  }
}
