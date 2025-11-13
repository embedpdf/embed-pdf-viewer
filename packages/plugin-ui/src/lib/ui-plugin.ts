import { BasePlugin, PluginRegistry, createScopedEmitter } from '@embedpdf/core';
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
  setActivePanel,
  closePanelSlot,
  setPanelTab,
  openModal,
  closeModal,
  openMenu,
  closeMenu,
  closeAllMenus,
} from './actions';
import { mergeUISchema } from './utils/schema-merger';

export class UIPlugin extends BasePlugin<UIPluginConfig, UICapability, UIState, UIAction> {
  static readonly id = 'ui' as const;

  private schema: UISchema;

  // Events with scoped emitters
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
  }

  async initialize(): Promise<void> {
    this.logger.info('UIPlugin', 'Initialize', 'UI plugin initialized');
  }

  async destroy(): Promise<void> {
    this.toolbarChanged$.clear();
    this.panelChanged$.clear();
    this.modalChanged$.clear();
    this.menuChanged$.clear();
    super.destroy();
  }

  protected override onDocumentLoadingStarted(documentId: string): void {
    this.dispatch(initUIState(documentId));
  }

  protected override onDocumentClosed(documentId: string): void {
    this.dispatch(cleanupUIState(documentId));

    // Clear scoped emitters
    this.toolbarChanged$.clearScope(documentId);
    this.panelChanged$.clearScope(documentId);
    this.modalChanged$.clearScope(documentId);
    this.menuChanged$.clearScope(documentId);
  }

  // ─────────────────────────────────────────────────────────
  // Capability
  // ─────────────────────────────────────────────────────────

  protected buildCapability(): UICapability {
    return {
      setActiveToolbar: (placement, slot, toolbarId, documentId) => {
        const docId = documentId ?? this.getActiveDocumentId();
        this.dispatch(setActiveToolbar(docId, placement, slot, toolbarId));
        this.toolbarChanged$.emit(docId, { placement, slot, toolbarId });
      },

      setActivePanel: (placement, slot, panelId, documentId, activeTab) => {
        const docId = documentId ?? this.getActiveDocumentId();
        this.dispatch(setActivePanel(docId, placement, slot, panelId, activeTab));
        this.panelChanged$.emit(docId, { placement, slot, panelId });
      },

      togglePanel: (placement, slot, panelId, documentId, activeTab) => {
        const docId = documentId ?? this.getActiveDocumentId();
        const slotKey = `${placement}-${slot}`;
        const currentPanelId = this.state.documents[docId]?.activePanels[slotKey];

        if (currentPanelId === panelId) {
          // Panel is open, close it
          this.dispatch(closePanelSlot(docId, placement, slot));
          this.panelChanged$.emit(docId, { placement, slot, panelId: '' });
        } else {
          // Panel is closed or different panel is open, open it
          this.dispatch(setActivePanel(docId, placement, slot, panelId, activeTab));
          this.panelChanged$.emit(docId, { placement, slot, panelId });
        }
      },

      openModal: (modalId, documentId) => {
        const docId = documentId ?? this.getActiveDocumentId();
        this.dispatch(openModal(docId, modalId));
        this.modalChanged$.emit(docId, { modalId });
      },

      openMenu: (menuId, triggeredByCommandId, triggeredByItemId, documentId) => {
        const docId = documentId ?? this.getActiveDocumentId();
        this.dispatch(openMenu(docId, { menuId, triggeredByCommandId, triggeredByItemId }));
        this.menuChanged$.emit(docId, { menuId, isOpen: true });
      },

      toggleMenu: (menuId, triggeredByCommandId, triggeredByItemId, documentId) => {
        const docId = documentId ?? this.getActiveDocumentId();
        const isOpen = !!this.state.documents[docId]?.openMenus[menuId];

        if (isOpen) {
          this.dispatch(closeMenu(docId, menuId));
          this.menuChanged$.emit(docId, { menuId, isOpen: false });
        } else {
          this.dispatch(openMenu(docId, { menuId, triggeredByCommandId, triggeredByItemId }));
          this.menuChanged$.emit(docId, { menuId, isOpen: true });
        }
      },

      forDocument: (documentId) => this.createUIScope(documentId),

      getSchema: () => this.schema,

      mergeSchema: (partial) => {
        this.schema = mergeUISchema(this.schema, partial);
      },

      onToolbarChanged: this.toolbarChanged$.onGlobal,
      onPanelChanged: this.panelChanged$.onGlobal,
      onModalChanged: this.modalChanged$.onGlobal,
      onMenuChanged: this.menuChanged$.onGlobal,
    };
  }

  // ─────────────────────────────────────────────────────────
  // Document Scope
  // ─────────────────────────────────────────────────────────

  private createUIScope(documentId: string): UIScope {
    return {
      setActiveToolbar: (placement, slot, toolbarId) => {
        this.dispatch(setActiveToolbar(documentId, placement, slot, toolbarId));
        this.toolbarChanged$.emit(documentId, { placement, slot, toolbarId });
      },

      getActiveToolbar: (placement, slot) => {
        const slotKey = `${placement}-${slot}`;
        return this.getDocumentState(documentId).activeToolbars[slotKey] ?? null;
      },

      setActivePanel: (placement, slot, panelId, activeTab) => {
        this.dispatch(setActivePanel(documentId, placement, slot, panelId, activeTab));
        this.panelChanged$.emit(documentId, { placement, slot, panelId });
      },

      getActivePanel: (placement, slot) => {
        const slotKey = `${placement}-${slot}`;
        return this.getDocumentState(documentId).activePanels[slotKey] ?? null;
      },

      closePanelSlot: (placement, slot) => {
        this.dispatch(closePanelSlot(documentId, placement, slot));
        this.panelChanged$.emit(documentId, { placement, slot, panelId: '' });
      },

      togglePanel: (placement, slot, panelId, activeTab) => {
        const slotKey = `${placement}-${slot}`;
        const currentPanelId = this.getDocumentState(documentId).activePanels[slotKey];

        if (currentPanelId === panelId) {
          // Panel is open, close it
          this.dispatch(closePanelSlot(documentId, placement, slot));
          this.panelChanged$.emit(documentId, { placement, slot, panelId: '' });
        } else {
          // Panel is closed or different panel is open, open it
          this.dispatch(setActivePanel(documentId, placement, slot, panelId, activeTab));
          this.panelChanged$.emit(documentId, { placement, slot, panelId });
        }
      },

      setPanelTab: (panelId, tabId) => {
        this.dispatch(setPanelTab(documentId, panelId, tabId));
      },

      getPanelTab: (panelId) => {
        return this.getDocumentState(documentId).panelTabs[panelId] ?? null;
      },

      openModal: (modalId) => {
        this.dispatch(openModal(documentId, modalId));
        this.modalChanged$.emit(documentId, { modalId });
      },

      closeModal: () => {
        this.dispatch(closeModal(documentId));
        this.modalChanged$.emit(documentId, { modalId: null });
      },

      getActiveModal: () => {
        return this.getDocumentState(documentId).activeModal;
      },

      openMenu: (menuId, triggeredByCommandId, triggeredByItemId) => {
        this.dispatch(openMenu(documentId, { menuId, triggeredByCommandId, triggeredByItemId }));
        this.menuChanged$.emit(documentId, { menuId, isOpen: true });
      },

      closeMenu: (menuId) => {
        this.dispatch(closeMenu(documentId, menuId));
        this.menuChanged$.emit(documentId, { menuId, isOpen: false });
      },

      toggleMenu: (menuId, triggeredByCommandId, triggeredByItemId) => {
        const isOpen = !!this.getDocumentState(documentId).openMenus[menuId];

        if (isOpen) {
          this.dispatch(closeMenu(documentId, menuId));
          this.menuChanged$.emit(documentId, { menuId, isOpen: false });
        } else {
          this.dispatch(openMenu(documentId, { menuId, triggeredByCommandId, triggeredByItemId }));
          this.menuChanged$.emit(documentId, { menuId, isOpen: true });
        }
      },

      closeAllMenus: () => {
        this.dispatch(closeAllMenus(documentId));
      },

      isMenuOpen: (menuId) => {
        return !!this.getDocumentState(documentId).openMenus[menuId];
      },

      getOpenMenus: () => {
        return Object.values(this.getDocumentState(documentId).openMenus);
      },

      getSchema: () => this.schema,

      getState: () => this.getDocumentState(documentId),

      onToolbarChanged: this.toolbarChanged$.forScope(documentId),
      onPanelChanged: this.panelChanged$.forScope(documentId),
      onModalChanged: this.modalChanged$.forScope(documentId),
      onMenuChanged: this.menuChanged$.forScope(documentId),
    };
  }

  private getDocumentState(documentId: string): UIDocumentState {
    const state = this.state.documents[documentId];
    if (!state) {
      throw new Error(`UI state not found for document: ${documentId}`);
    }
    return state;
  }
}
