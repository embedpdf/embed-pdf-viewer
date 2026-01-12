import { Action } from '@embedpdf/core';
import { OpenMenuState, UISchema } from './types';

export const INIT_UI_STATE = 'UI/INIT_STATE';
export const CLEANUP_UI_STATE = 'UI/CLEANUP_STATE';
export const SET_ACTIVE_TOOLBAR = 'UI/SET_ACTIVE_TOOLBAR';
export const CLOSE_TOOLBAR_SLOT = 'UI/CLOSE_TOOLBAR_SLOT';

// Sidebar actions
export const SET_ACTIVE_SIDEBAR = 'UI/SET_ACTIVE_SIDEBAR';
export const CLOSE_SIDEBAR_SLOT = 'UI/CLOSE_SIDEBAR_SLOT';
export const SET_SIDEBAR_TAB = 'UI/SET_SIDEBAR_TAB';

// Modal actions (with animation lifecycle)
export const OPEN_MODAL = 'UI/OPEN_MODAL';
export const CLOSE_MODAL = 'UI/CLOSE_MODAL';
export const CLEAR_MODAL = 'UI/CLEAR_MODAL';

// Menu actions
export const OPEN_MENU = 'UI/OPEN_MENU';
export const CLOSE_MENU = 'UI/CLOSE_MENU';
export const CLOSE_ALL_MENUS = 'UI/CLOSE_ALL_MENUS';

// Overlay actions
export const SET_OVERLAY_ENABLED = 'UI/SET_OVERLAY_ENABLED';

// Category actions
export const SET_DISABLED_CATEGORIES = 'UI/SET_DISABLED_CATEGORIES';
export const SET_HIDDEN_ITEMS = 'UI/SET_HIDDEN_ITEMS';

export interface InitUIStateAction extends Action {
  type: typeof INIT_UI_STATE;
  payload: { documentId: string; schema: UISchema };
}

export interface CleanupUIStateAction extends Action {
  type: typeof CLEANUP_UI_STATE;
  payload: { documentId: string };
}

export interface SetActiveToolbarAction extends Action {
  type: typeof SET_ACTIVE_TOOLBAR;
  payload: { documentId: string; placement: string; slot: string; toolbarId: string };
}

export interface CloseToolbarSlotAction extends Action {
  type: typeof CLOSE_TOOLBAR_SLOT;
  payload: { documentId: string; placement: string; slot: string };
}

// Sidebar action types
export interface SetActiveSidebarAction extends Action {
  type: typeof SET_ACTIVE_SIDEBAR;
  payload: {
    documentId: string;
    placement: string;
    slot: string;
    sidebarId: string;
    activeTab?: string;
  };
}

export interface CloseSidebarSlotAction extends Action {
  type: typeof CLOSE_SIDEBAR_SLOT;
  payload: { documentId: string; placement: string; slot: string };
}

export interface SetSidebarTabAction extends Action {
  type: typeof SET_SIDEBAR_TAB;
  payload: { documentId: string; sidebarId: string; tabId: string };
}

// Modal action types (with animation lifecycle)
export interface OpenModalAction extends Action {
  type: typeof OPEN_MODAL;
  payload: { documentId: string; modalId: string };
}

export interface CloseModalAction extends Action {
  type: typeof CLOSE_MODAL;
  payload: { documentId: string };
}

export interface ClearModalAction extends Action {
  type: typeof CLEAR_MODAL;
  payload: { documentId: string };
}

export interface OpenMenuAction extends Action {
  type: typeof OPEN_MENU;
  payload: { documentId: string; menuState: OpenMenuState };
}

export interface CloseMenuAction extends Action {
  type: typeof CLOSE_MENU;
  payload: { documentId: string; menuId: string };
}

export interface CloseAllMenusAction extends Action {
  type: typeof CLOSE_ALL_MENUS;
  payload: { documentId: string };
}

// Overlay action types
export interface SetOverlayEnabledAction extends Action {
  type: typeof SET_OVERLAY_ENABLED;
  payload: { documentId: string; overlayId: string; enabled: boolean };
}

export interface SetDisabledCategoriesAction extends Action {
  type: typeof SET_DISABLED_CATEGORIES;
  payload: { categories: string[] };
}

export interface SetHiddenItemsAction extends Action {
  type: typeof SET_HIDDEN_ITEMS;
  payload: { hiddenItems: string[] };
}

export type UIAction =
  | InitUIStateAction
  | CleanupUIStateAction
  | SetActiveToolbarAction
  | CloseToolbarSlotAction
  | SetActiveSidebarAction
  | CloseSidebarSlotAction
  | SetSidebarTabAction
  | OpenModalAction
  | CloseModalAction
  | ClearModalAction
  | OpenMenuAction
  | CloseMenuAction
  | CloseAllMenusAction
  | SetOverlayEnabledAction
  | SetDisabledCategoriesAction
  | SetHiddenItemsAction;

// Action creators
export const initUIState = (documentId: string, schema: UISchema): InitUIStateAction => ({
  type: INIT_UI_STATE,
  payload: { documentId, schema },
});

export const cleanupUIState = (documentId: string): CleanupUIStateAction => ({
  type: CLEANUP_UI_STATE,
  payload: { documentId },
});

export const setActiveToolbar = (
  documentId: string,
  placement: string,
  slot: string,
  toolbarId: string,
): SetActiveToolbarAction => ({
  type: SET_ACTIVE_TOOLBAR,
  payload: { documentId, placement, slot, toolbarId },
});

export const closeToolbarSlot = (
  documentId: string,
  placement: string,
  slot: string,
): CloseToolbarSlotAction => ({
  type: CLOSE_TOOLBAR_SLOT,
  payload: { documentId, placement, slot },
});

// Sidebar action creators
export const setActiveSidebar = (
  documentId: string,
  placement: string,
  slot: string,
  sidebarId: string,
  activeTab?: string,
): SetActiveSidebarAction => ({
  type: SET_ACTIVE_SIDEBAR,
  payload: { documentId, placement, slot, sidebarId, activeTab },
});

export const closeSidebarSlot = (
  documentId: string,
  placement: string,
  slot: string,
): CloseSidebarSlotAction => ({
  type: CLOSE_SIDEBAR_SLOT,
  payload: { documentId, placement, slot },
});

export const setSidebarTab = (
  documentId: string,
  sidebarId: string,
  tabId: string,
): SetSidebarTabAction => ({
  type: SET_SIDEBAR_TAB,
  payload: { documentId, sidebarId, tabId },
});

// Modal action creators (with animation lifecycle)
export const openModal = (documentId: string, modalId: string): OpenModalAction => ({
  type: OPEN_MODAL,
  payload: { documentId, modalId },
});

export const closeModal = (documentId: string): CloseModalAction => ({
  type: CLOSE_MODAL,
  payload: { documentId },
});

export const clearModal = (documentId: string): ClearModalAction => ({
  type: CLEAR_MODAL,
  payload: { documentId },
});

export const openMenu = (documentId: string, menuState: OpenMenuState): OpenMenuAction => ({
  type: OPEN_MENU,
  payload: { documentId, menuState },
});

export const closeMenu = (documentId: string, menuId: string): CloseMenuAction => ({
  type: CLOSE_MENU,
  payload: { documentId, menuId },
});

export const closeAllMenus = (documentId: string): CloseAllMenusAction => ({
  type: CLOSE_ALL_MENUS,
  payload: { documentId },
});

// Overlay action creators
export const setOverlayEnabled = (
  documentId: string,
  overlayId: string,
  enabled: boolean,
): SetOverlayEnabledAction => ({
  type: SET_OVERLAY_ENABLED,
  payload: { documentId, overlayId, enabled },
});

export const setDisabledCategories = (categories: string[]): SetDisabledCategoriesAction => ({
  type: SET_DISABLED_CATEGORIES,
  payload: { categories },
});

export const setHiddenItems = (hiddenItems: string[]): SetHiddenItemsAction => ({
  type: SET_HIDDEN_ITEMS,
  payload: { hiddenItems },
});
