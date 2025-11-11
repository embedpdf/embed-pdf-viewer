import { BasePluginConfig, EventHook } from '@embedpdf/core';
import { UISchema } from './schema';

// Re-export schema types
export * from './schema';

export interface UIPluginConfig extends BasePluginConfig {
  schema: UISchema;
}

export interface UIState {
  documents: Record<string, UIDocumentState>;
}

export interface UIDocumentState {
  // Active toolbar per slot
  activeToolbars: Record<string, string>; // `${placement}-${slot}` -> toolbarId

  // Active panel per slot
  activePanels: Record<string, string>; // `${placement}-${slot}` -> panelId

  // Active modal (only one globally)
  activeModal: string | null;

  // Open menus with metadata
  openMenus: Record<string, OpenMenuState>;

  // Active tabs within panels
  panelTabs: Record<string, string>; // panelId -> activeTabId
}

// ─────────────────────────────────────────────────────────
// Events
// ─────────────────────────────────────────────────────────

export interface ToolbarChangedData {
  placement: string;
  slot: string;
  toolbarId: string;
}

export interface ToolbarChangedEvent extends ToolbarChangedData {
  documentId: string;
}

export interface PanelChangedData {
  placement: string;
  slot: string;
  panelId: string;
}

export interface PanelChangedEvent extends PanelChangedData {
  documentId: string;
}

export interface ModalChangedData {
  modalId: string | null;
}

export interface ModalChangedEvent extends ModalChangedData {
  documentId: string;
}

export interface MenuChangedData {
  menuId: string;
  isOpen: boolean;
}

export interface MenuChangedEvent extends MenuChangedData {
  documentId: string;
}

export interface OpenMenuState {
  menuId: string;
  triggeredByCommandId: string; // Which command opened it
  triggeredByItemId: string; // Which toolbar/menu item triggered it
}

// ─────────────────────────────────────────────────────────
// Capability
// ─────────────────────────────────────────────────────────

export interface UIScope {
  // Toolbars
  setActiveToolbar(placement: string, slot: string, toolbarId: string): void;
  getActiveToolbar(placement: string, slot: string): string | null;

  // Panels
  setActivePanel(placement: string, slot: string, panelId: string, activeTab?: string): void;
  getActivePanel(placement: string, slot: string): string | null;
  closePanelSlot(placement: string, slot: string): void;
  setPanelTab(panelId: string, tabId: string): void;
  getPanelTab(panelId: string): string | null;

  // Modals
  openModal(modalId: string): void;
  closeModal(): void;
  getActiveModal(): string | null;

  // Menus
  openMenu(menuId: string, triggeredByCommandId: string, triggeredByItemId: string): void;
  closeMenu(menuId: string): void;
  closeAllMenus(): void;
  isMenuOpen(menuId: string): boolean;
  getOpenMenus(): OpenMenuState[];

  // Schema access
  getSchema(): UISchema;

  // State
  getState(): UIDocumentState;

  // Events
  onToolbarChanged: EventHook<{ placement: string; slot: string; toolbarId: string }>;
  onPanelChanged: EventHook<{ placement: string; slot: string; panelId: string }>;
  onModalChanged: EventHook<{ modalId: string | null }>;
  onMenuChanged: EventHook<{ menuId: string; isOpen: boolean }>;
}

export interface UICapability {
  // Active document operations
  setActiveToolbar(placement: string, slot: string, toolbarId: string, documentId?: string): void;
  setActivePanel(
    placement: string,
    slot: string,
    panelId: string,
    documentId?: string,
    activeTab?: string,
  ): void;
  openModal(modalId: string, documentId?: string): void;
  openMenu(
    menuId: string,
    triggeredByCommandId: string,
    triggeredByItemId: string,
    documentId?: string,
  ): void;

  // Document-scoped operations
  forDocument(documentId: string): UIScope;

  // Schema access
  getSchema(): UISchema;
  mergeSchema(partial: Partial<UISchema>): void;

  // Global events
  onToolbarChanged: EventHook<{
    documentId: string;
    placement: string;
    slot: string;
    toolbarId: string;
  }>;
  onPanelChanged: EventHook<{
    documentId: string;
    placement: string;
    slot: string;
    panelId: string;
  }>;
  onModalChanged: EventHook<{ documentId: string; modalId: string | null }>;
  onMenuChanged: EventHook<{ documentId: string; menuId: string; isOpen: boolean }>;
}
