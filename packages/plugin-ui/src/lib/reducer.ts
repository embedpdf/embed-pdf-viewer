import { UIState, UIDocumentState } from './types';
import {
  UIAction,
  INIT_UI_STATE,
  CLEANUP_UI_STATE,
  SET_ACTIVE_TOOLBAR,
  SET_ACTIVE_PANEL,
  CLOSE_PANEL_SLOT,
  CLOSE_TOOLBAR_SLOT,
  SET_PANEL_TAB,
  OPEN_MODAL,
  CLOSE_MODAL,
  OPEN_MENU,
  CLOSE_MENU,
  CLOSE_ALL_MENUS,
} from './actions';

export const initialDocumentState: UIDocumentState = {
  activeToolbars: {},
  activePanels: {},
  activeModal: null,
  openMenus: {},
  panelTabs: {},
};

export const initialState: UIState = {
  documents: {},
};

export const uiReducer = (state = initialState, action: UIAction): UIState => {
  switch (action.type) {
    case INIT_UI_STATE: {
      const { documentId, schema } = action.payload;

      // Initialize permanent toolbars from schema
      const activeToolbars: Record<string, { toolbarId: string; isOpen: boolean }> = {};

      Object.values(schema.toolbars).forEach((toolbar) => {
        if (toolbar.permanent && toolbar.position) {
          const slotKey = `${toolbar.position.placement}-${toolbar.position.slot}`;
          activeToolbars[slotKey] = {
            toolbarId: toolbar.id,
            isOpen: true, // Permanent toolbars are always open
          };
        }
      });

      return {
        ...state,
        documents: {
          ...state.documents,
          [documentId]: {
            ...initialDocumentState,
            activeToolbars, // Initialize with permanent toolbars
          },
        },
      };
    }

    case CLEANUP_UI_STATE: {
      const { documentId } = action.payload;
      const { [documentId]: removed, ...remaining } = state.documents;
      return {
        ...state,
        documents: remaining,
      };
    }

    case SET_ACTIVE_TOOLBAR: {
      const { documentId, placement, slot, toolbarId } = action.payload;
      const docState = state.documents[documentId] || initialDocumentState;
      const slotKey = `${placement}-${slot}`;

      return {
        ...state,
        documents: {
          ...state.documents,
          [documentId]: {
            ...docState,
            activeToolbars: {
              ...docState.activeToolbars,
              [slotKey]: {
                toolbarId,
                isOpen: true,
              },
            },
          },
        },
      };
    }

    case SET_ACTIVE_PANEL: {
      const { documentId, placement, slot, panelId, activeTab } = action.payload;
      const docState = state.documents[documentId] || initialDocumentState;
      const slotKey = `${placement}-${slot}`;

      return {
        ...state,
        documents: {
          ...state.documents,
          [documentId]: {
            ...docState,
            activePanels: {
              ...docState.activePanels,
              [slotKey]: {
                panelId,
                isOpen: true,
              },
            },
            ...(activeTab && {
              panelTabs: {
                ...docState.panelTabs,
                [panelId]: activeTab,
              },
            }),
          },
        },
      };
    }

    case CLOSE_PANEL_SLOT: {
      const { documentId, placement, slot } = action.payload;
      const docState = state.documents[documentId];
      if (!docState) return state;

      const slotKey = `${placement}-${slot}`;
      const panelSlot = docState.activePanels[slotKey];

      // If no panel in this slot, nothing to close
      if (!panelSlot) return state;

      return {
        ...state,
        documents: {
          ...state.documents,
          [documentId]: {
            ...docState,
            activePanels: {
              ...docState.activePanels,
              [slotKey]: {
                ...panelSlot,
                isOpen: false, // Keep panel, just close it
              },
            },
          },
        },
      };
    }

    case CLOSE_TOOLBAR_SLOT: {
      const { documentId, placement, slot } = action.payload;
      const docState = state.documents[documentId];
      if (!docState) return state;

      const slotKey = `${placement}-${slot}`;
      const toolbarSlot = docState.activeToolbars[slotKey];

      // If no toolbar in this slot, nothing to close
      if (!toolbarSlot) return state;

      return {
        ...state,
        documents: {
          ...state.documents,
          [documentId]: {
            ...docState,
            activeToolbars: {
              ...docState.activeToolbars,
              [slotKey]: {
                ...toolbarSlot,
                isOpen: false, // Keep toolbar, just close it
              },
            },
          },
        },
      };
    }

    case SET_PANEL_TAB: {
      const { documentId, panelId, tabId } = action.payload;
      const docState = state.documents[documentId] || initialDocumentState;

      return {
        ...state,
        documents: {
          ...state.documents,
          [documentId]: {
            ...docState,
            panelTabs: {
              ...docState.panelTabs,
              [panelId]: tabId,
            },
          },
        },
      };
    }

    case OPEN_MODAL: {
      const { documentId, modalId } = action.payload;
      const docState = state.documents[documentId] || initialDocumentState;

      return {
        ...state,
        documents: {
          ...state.documents,
          [documentId]: {
            ...docState,
            activeModal: modalId,
            openMenus: {}, // Close all menus when opening modal
          },
        },
      };
    }

    case CLOSE_MODAL: {
      const { documentId } = action.payload;
      const docState = state.documents[documentId];
      if (!docState) return state;

      return {
        ...state,
        documents: {
          ...state.documents,
          [documentId]: {
            ...docState,
            activeModal: null,
          },
        },
      };
    }

    case OPEN_MENU: {
      const { documentId, menuState } = action.payload;
      const docState = state.documents[documentId] || initialDocumentState;

      return {
        ...state,
        documents: {
          ...state.documents,
          [documentId]: {
            ...docState,
            openMenus: {
              // Close other menus, open this one
              [menuState.menuId]: menuState,
            },
          },
        },
      };
    }

    case CLOSE_MENU: {
      const { documentId, menuId } = action.payload;
      const docState = state.documents[documentId];
      if (!docState) return state;

      const { [menuId]: removed, ...remainingMenus } = docState.openMenus;

      return {
        ...state,
        documents: {
          ...state.documents,
          [documentId]: {
            ...docState,
            openMenus: remainingMenus,
          },
        },
      };
    }

    case CLOSE_ALL_MENUS: {
      const { documentId } = action.payload;
      const docState = state.documents[documentId];
      if (!docState) return state;

      return {
        ...state,
        documents: {
          ...state.documents,
          [documentId]: {
            ...docState,
            openMenus: {},
          },
        },
      };
    }

    default:
      return state;
  }
};
