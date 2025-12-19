import { BasePluginConfig, EventHook } from '@embedpdf/core';
import { UISchema } from './schema';
import { StylesheetConfig } from './utils';

// Re-export schema types
export * from './schema';

export interface UIPluginConfig extends BasePluginConfig {
  /** UI schema */
  schema: UISchema;

  /** Categories to disable at initialization */
  disabledCategories?: string[];

  /** Config for stylesheet generation */
  stylesheetConfig?: StylesheetConfig;
}

export interface UIState {
  documents: Record<string, UIDocumentState>;

  /** Globally disabled categories */
  disabledCategories: string[];

  /** Item IDs that are hidden (computed from disabled categories) */
  hiddenItems: string[];
}

/**
 * Toolbar slot state
 */
export interface ToolbarSlotState {
  toolbarId: string;
  isOpen: boolean;
}

/**
 * Sidebar slot state
 */
export interface SidebarSlotState {
  sidebarId: string;
  isOpen: boolean;
}

/**
 * Modal slot state - supports animation lifecycle
 */
export interface ModalSlotState {
  modalId: string;
  isOpen: boolean; // false = animating out, true = visible
}

export interface UIDocumentState {
  // Active toolbar per slot
  // `${placement}-${slot}` -> { toolbarId, isOpen }
  activeToolbars: Record<string, ToolbarSlotState>;

  // Active sidebar per slot
  // `${placement}-${slot}` -> { sidebarId, isOpen }
  activeSidebars: Record<string, SidebarSlotState>;

  // Active modal (only one globally, supports animation lifecycle)
  activeModal: ModalSlotState | null;

  // Open menus with metadata
  openMenus: Record<string, OpenMenuState>;

  // Active tabs within sidebars
  sidebarTabs: Record<string, string>; // sidebarId -> activeTabId
}

/**
 * Responsive visibility rule for a single item at a specific breakpoint
 */
export interface ResponsiveVisibilityRule {
  breakpointId: string;
  minWidth?: number;
  maxWidth?: number;
  visible: boolean;
  priority: number; // Higher priority wins in conflicts
}

/**
 * Computed responsive metadata for an item
 */
export interface ResponsiveItemMetadata {
  itemId: string;
  /** Always true for SSR/hydration - actual visibility controlled by CSS/styles */
  shouldRender: boolean;
  /** Ordered rules from lowest to highest breakpoint */
  visibilityRules: ResponsiveVisibilityRule[];
  /** Quick lookup: is visible at default/base size? */
  defaultVisible: boolean;
}

/**
 * Result of processing all responsive rules
 */
export interface ResponsiveMetadata {
  items: Map<string, ResponsiveItemMetadata>;
  breakpoints: Map<string, { minWidth?: number; maxWidth?: number }>;
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

export interface SidebarChangedData {
  placement: string;
  slot: string;
  sidebarId: string;
}

export interface SidebarChangedEvent extends SidebarChangedData {
  documentId: string;
}

export interface ModalChangedData {
  modalId: string | null;
  isOpen: boolean;
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
  triggeredByCommandId?: string; // Which command opened it
  triggeredByItemId?: string; // Which toolbar/menu item triggered it
}

// ─────────────────────────────────────────────────────────
// Capability
// ─────────────────────────────────────────────────────────

export interface UIScope {
  // Toolbars
  setActiveToolbar(placement: string, slot: string, toolbarId: string): void;
  getActiveToolbar(placement: string, slot: string): string | null;
  closeToolbarSlot(placement: string, slot: string): void;
  isToolbarOpen(placement: string, slot: string, toolbarId?: string): boolean;

  // Sidebars
  setActiveSidebar(placement: string, slot: string, sidebarId: string, activeTab?: string): void;
  getActiveSidebar(placement: string, slot: string): string | null;
  closeSidebarSlot(placement: string, slot: string): void;
  toggleSidebar(placement: string, slot: string, sidebarId: string, activeTab?: string): void;
  setSidebarTab(sidebarId: string, tabId: string): void;
  getSidebarTab(sidebarId: string): string | null;
  isSidebarOpen(placement: string, slot: string, sidebarId?: string): boolean;

  // Modals (with animation lifecycle support)
  openModal(modalId: string): void;
  closeModal(): void;
  clearModal(): void; // Called after exit animation completes
  getActiveModal(): ModalSlotState | null;
  isModalOpen(): boolean;

  // Menus
  openMenu(menuId: string, triggeredByCommandId: string, triggeredByItemId: string): void;
  closeMenu(menuId: string): void;
  toggleMenu(menuId: string, triggeredByCommandId: string, triggeredByItemId: string): void;
  closeAllMenus(): void;
  isMenuOpen(menuId: string): boolean;
  getOpenMenus(): OpenMenuState[];

  // Schema access
  getSchema(): UISchema;

  // State
  getState(): UIDocumentState;

  // Events
  onToolbarChanged: EventHook<{ placement: string; slot: string; toolbarId: string }>;
  onSidebarChanged: EventHook<{ placement: string; slot: string; sidebarId: string }>;
  onModalChanged: EventHook<{ modalId: string | null; isOpen: boolean }>;
  onMenuChanged: EventHook<{ menuId: string; isOpen: boolean }>;
}

export interface UICapability {
  // Active document operations
  setActiveToolbar(placement: string, slot: string, toolbarId: string, documentId?: string): void;
  setActiveSidebar(
    placement: string,
    slot: string,
    sidebarId: string,
    documentId?: string,
    activeTab?: string,
  ): void;
  toggleSidebar(
    placement: string,
    slot: string,
    sidebarId: string,
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
  toggleMenu(
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

  // Category management
  disableCategory(category: string): void;
  enableCategory(category: string): void;
  toggleCategory(category: string): void;
  setDisabledCategories(categories: string[]): void;
  getDisabledCategories(): string[];
  isCategoryDisabled(category: string): boolean;
  getHiddenItems(): string[];

  // Global events
  onToolbarChanged: EventHook<{
    documentId: string;
    placement: string;
    slot: string;
    toolbarId: string;
  }>;
  onSidebarChanged: EventHook<{
    documentId: string;
    placement: string;
    slot: string;
    sidebarId: string;
  }>;
  onModalChanged: EventHook<{ documentId: string; modalId: string | null; isOpen: boolean }>;
  onMenuChanged: EventHook<{ documentId: string; menuId: string; isOpen: boolean }>;
  onCategoryChanged: EventHook<{ disabledCategories: string[]; hiddenItems: string[] }>;
}
