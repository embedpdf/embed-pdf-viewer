import { UIState, UIDocumentState } from './types';
import {
  UIAction,
  INIT_UI_STATE,
  CLEANUP_UI_STATE,
  SET_ACTIVE_TOOLBAR,
  SET_ACTIVE_SIDEBAR,
  CLOSE_SIDEBAR_SLOT,
  CLOSE_TOOLBAR_SLOT,
  SET_SIDEBAR_TAB,
  OPEN_MODAL,
  CLOSE_MODAL,
  CLEAR_MODAL,
  OPEN_MENU,
  CLOSE_MENU,
  CLOSE_ALL_MENUS,
  SET_DISABLED_CATEGORIES,
  SET_HIDDEN_ITEMS,
} from './actions';

export const initialDocumentState: UIDocumentState = {
  activeToolbars: {},
  activeSidebars: {},
  activeModal: null,
  openMenus: {},
  sidebarTabs: {},
};

export const initialState: UIState = {
  documents: {},
  disabledCategories: [],
  hiddenItems: [],
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

    // ─────────────────────────────────────────────────────────
    // Sidebar Actions
    // ─────────────────────────────────────────────────────────

    case SET_ACTIVE_SIDEBAR: {
      const { documentId, placement, slot, sidebarId, activeTab } = action.payload;
      const docState = state.documents[documentId] || initialDocumentState;
      const slotKey = `${placement}-${slot}`;

      return {
        ...state,
        documents: {
          ...state.documents,
          [documentId]: {
            ...docState,
            activeSidebars: {
              ...docState.activeSidebars,
              [slotKey]: {
                sidebarId,
                isOpen: true,
              },
            },
            ...(activeTab && {
              sidebarTabs: {
                ...docState.sidebarTabs,
                [sidebarId]: activeTab,
              },
            }),
          },
        },
      };
    }

    case CLOSE_SIDEBAR_SLOT: {
      const { documentId, placement, slot } = action.payload;
      const docState = state.documents[documentId];
      if (!docState) return state;

      const slotKey = `${placement}-${slot}`;
      const sidebarSlot = docState.activeSidebars[slotKey];

      // If no sidebar in this slot, nothing to close
      if (!sidebarSlot) return state;

      return {
        ...state,
        documents: {
          ...state.documents,
          [documentId]: {
            ...docState,
            activeSidebars: {
              ...docState.activeSidebars,
              [slotKey]: {
                ...sidebarSlot,
                isOpen: false, // Keep sidebar, just close it
              },
            },
          },
        },
      };
    }

    case SET_SIDEBAR_TAB: {
      const { documentId, sidebarId, tabId } = action.payload;
      const docState = state.documents[documentId] || initialDocumentState;

      return {
        ...state,
        documents: {
          ...state.documents,
          [documentId]: {
            ...docState,
            sidebarTabs: {
              ...docState.sidebarTabs,
              [sidebarId]: tabId,
            },
          },
        },
      };
    }

    // ─────────────────────────────────────────────────────────
    // Modal Actions (with animation lifecycle)
    // ─────────────────────────────────────────────────────────

    case OPEN_MODAL: {
      const { documentId, modalId } = action.payload;
      const docState = state.documents[documentId] || initialDocumentState;

      return {
        ...state,
        documents: {
          ...state.documents,
          [documentId]: {
            ...docState,
            activeModal: {
              modalId,
              isOpen: true,
            },
            openMenus: {}, // Close all menus when opening modal
          },
        },
      };
    }

    case CLOSE_MODAL: {
      const { documentId } = action.payload;
      const docState = state.documents[documentId];
      if (!docState?.activeModal) return state;

      return {
        ...state,
        documents: {
          ...state.documents,
          [documentId]: {
            ...docState,
            activeModal: {
              ...docState.activeModal,
              isOpen: false, // Keep modal for exit animation
            },
          },
        },
      };
    }

    case CLEAR_MODAL: {
      const { documentId } = action.payload;
      const docState = state.documents[documentId];
      if (!docState) return state;

      // Only clear if modal is closed (animation completed)
      if (docState.activeModal?.isOpen) return state;

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

    // ─────────────────────────────────────────────────────────
    // Menu Actions
    // ─────────────────────────────────────────────────────────

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

    case SET_DISABLED_CATEGORIES: {
      return {
        ...state,
        disabledCategories: action.payload.categories,
      };
    }

    case SET_HIDDEN_ITEMS: {
      return {
        ...state,
        hiddenItems: action.payload.hiddenItems,
      };
    }

    default:
      return state;
  }
};
