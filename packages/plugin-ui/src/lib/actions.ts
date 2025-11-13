import { Action } from '@embedpdf/core';
import { OpenMenuState, UISchema } from './types';

export const INIT_UI_STATE = 'UI/INIT_STATE';
export const CLEANUP_UI_STATE = 'UI/CLEANUP_STATE';
export const SET_ACTIVE_TOOLBAR = 'UI/SET_ACTIVE_TOOLBAR';
export const CLOSE_TOOLBAR_SLOT = 'UI/CLOSE_TOOLBAR_SLOT';
export const SET_ACTIVE_PANEL = 'UI/SET_ACTIVE_PANEL';
export const CLOSE_PANEL_SLOT = 'UI/CLOSE_PANEL_SLOT';
export const SET_PANEL_TAB = 'UI/SET_PANEL_TAB';
export const OPEN_MODAL = 'UI/OPEN_MODAL';
export const CLOSE_MODAL = 'UI/CLOSE_MODAL';
export const OPEN_MENU = 'UI/OPEN_MENU';
export const CLOSE_MENU = 'UI/CLOSE_MENU';
export const CLOSE_ALL_MENUS = 'UI/CLOSE_ALL_MENUS';

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

export interface SetActivePanelAction extends Action {
  type: typeof SET_ACTIVE_PANEL;
  payload: {
    documentId: string;
    placement: string;
    slot: string;
    panelId: string;
    activeTab?: string;
  };
}

export interface ClosePanelSlotAction extends Action {
  type: typeof CLOSE_PANEL_SLOT;
  payload: { documentId: string; placement: string; slot: string };
}

export interface SetPanelTabAction extends Action {
  type: typeof SET_PANEL_TAB;
  payload: { documentId: string; panelId: string; tabId: string };
}

export interface OpenModalAction extends Action {
  type: typeof OPEN_MODAL;
  payload: { documentId: string; modalId: string };
}

export interface CloseModalAction extends Action {
  type: typeof CLOSE_MODAL;
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

export type UIAction =
  | InitUIStateAction
  | CleanupUIStateAction
  | SetActiveToolbarAction
  | CloseToolbarSlotAction
  | SetActivePanelAction
  | ClosePanelSlotAction
  | SetPanelTabAction
  | OpenModalAction
  | CloseModalAction
  | OpenMenuAction
  | CloseMenuAction
  | CloseAllMenusAction;

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

export const setActivePanel = (
  documentId: string,
  placement: string,
  slot: string,
  panelId: string,
  activeTab?: string,
): SetActivePanelAction => ({
  type: SET_ACTIVE_PANEL,
  payload: { documentId, placement, slot, panelId, activeTab },
});

export const closePanelSlot = (
  documentId: string,
  placement: string,
  slot: string,
): ClosePanelSlotAction => ({
  type: CLOSE_PANEL_SLOT,
  payload: { documentId, placement, slot },
});

export const setPanelTab = (
  documentId: string,
  panelId: string,
  tabId: string,
): SetPanelTabAction => ({
  type: SET_PANEL_TAB,
  payload: { documentId, panelId, tabId },
});

export const openModal = (documentId: string, modalId: string): OpenModalAction => ({
  type: OPEN_MODAL,
  payload: { documentId, modalId },
});

export const closeModal = (documentId: string): CloseModalAction => ({
  type: CLOSE_MODAL,
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
