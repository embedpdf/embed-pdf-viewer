---
'@embedpdf/plugin-ui': major
---

## Multi-Document Support

The UI plugin now supports per-document UI state including toolbars, panels, modals, and menus.

### Breaking Changes

- **Complete Action Refactoring**: All UI actions have been restructured:
  - Replaced `UI_INIT_COMPONENTS`, `UI_INIT_FLYOUT`, `UI_TOGGLE_FLYOUT` with new document-scoped actions
  - Replaced `UI_SET_HEADER_VISIBLE`, `UI_TOGGLE_PANEL` with `SET_ACTIVE_PANEL`, `CLOSE_PANEL_SLOT`
  - Replaced `UI_SHOW_COMMAND_MENU`, `UI_HIDE_COMMAND_MENU`, `UI_UPDATE_COMMAND_MENU` with `OPEN_MENU`, `CLOSE_MENU`, `CLOSE_ALL_MENUS`
  - Replaced `UI_UPDATE_COMPONENT_STATE` with document-scoped state management

- **All Actions**: Now require `documentId` parameter:
  - `setActiveToolbar(documentId, placement, slot, toolbarId)`
  - `closeToolbarSlot(documentId, placement, slot)`
  - `setActivePanel(documentId, placement, slot, panelId)`
  - `closePanelSlot(documentId, placement, slot)`
  - `setPanelTab(documentId, placement, slot, tabId)`
  - `openModal(documentId, modalId, props)`
  - `closeModal(documentId, modalId)`
  - `openMenu(documentId, menuState)`
  - `closeMenu(documentId, menuId)`
  - `closeAllMenus(documentId)`
  - `setDisabledCategories(documentId, categories)`

- **State Structure**: Plugin state now uses `documents: Record<string, UIDocumentState>` to track per-document UI state including toolbars, panels, modals, menus, and disabled categories.

### Framework-Specific Changes (React/Preact, Svelte, Vue)

- **AutoMenuRenderer Component**:
  - Now requires `documentId` prop (React/Preact: `@embedpdf/plugin-ui/react`, Svelte: `@embedpdf/plugin-ui/svelte`, Vue: `@embedpdf/plugin-ui/vue`)
  - Renders menus for a specific document
  - Uses document-scoped anchor registry and menu state

- **useUIState Hook**:
  - Now requires `documentId` parameter: `useUIState(documentId)`
  - Returns document-specific UI state

### New Features

- Per-document UI state management
- Per-document toolbar, panel, modal, and menu state
- Document lifecycle management with automatic state initialization and cleanup
- Support for multiple UI schemas per document
