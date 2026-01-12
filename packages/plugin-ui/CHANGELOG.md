# @embedpdf/plugin-ui

## 2.2.0

### Minor Changes

- [#389](https://github.com/embedpdf/embed-pdf-viewer/pull/389) by [@bobsingor](https://github.com/bobsingor) – Add overlay enable/disable functionality:
  - Add `SET_OVERLAY_ENABLED` action and `setOverlayEnabled` action creator
  - Add `enabledOverlays` state to `UIDocumentState` for tracking overlay visibility
  - Add overlay management methods to `UIScope`: `enableOverlay`, `disableOverlay`, `toggleOverlay`, `isOverlayEnabled`, `getEnabledOverlays`
  - Add `onOverlayChanged` event hook for overlay state changes
  - Update schema renderer to filter overlays by enabled state
  - Initialize overlay enabled state from schema's `defaultEnabled` property

## 2.1.2

## 2.1.1

### Patch Changes

- [#364](https://github.com/embedpdf/embed-pdf-viewer/pull/364) by [@bobsingor](https://github.com/bobsingor) – Fixed toolbar/sidebar/modal switching causing unnecessary component remounts

  The `useSchemaRenderer` hook was using the toolbar/sidebar/modal ID as the React key, which caused full component remounts when switching between different toolbars in the same slot (e.g., annotation-toolbar → shapes-toolbar). This resulted in visible flashing of sibling components like the RenderLayer.

  The fix uses stable slot-based keys (`toolbar-slot-top-secondary`, `sidebar-slot-left-main`, etc.) so that switching content within a slot only updates the children without remounting the wrapper element. This prevents React/Preact reconciliation from affecting sibling components in the tree.

## 2.1.0

## 2.0.2

## 2.0.1

## 2.0.0

### Major Changes

- [#279](https://github.com/embedpdf/embed-pdf-viewer/pull/279) by [@bobsingor](https://github.com/bobsingor) – ## Multi-Document Support

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

### Minor Changes

- [#303](https://github.com/embedpdf/embed-pdf-viewer/pull/303) by [@bobsingor](https://github.com/bobsingor) – Added `data-hidden-items` attribute for efficient CSS dependency rules.

  **Problem**: Visibility dependency rules (e.g., hiding overflow buttons when all menu items are hidden) required exponential CSS rules when using category-based logic, causing stylesheet bloat.

  **Solution**:
  - Added `hiddenItems` state that tracks which item IDs are hidden based on disabled categories
  - Dependency rules now use `data-epdf-hid` attribute to check item IDs directly
  - CSS rules are now O(n) per breakpoint instead of O(m^n)

  **New APIs**:
  - `getHiddenItems()` - returns array of hidden item IDs
  - `onCategoryChanged` event now includes `hiddenItems` in payload
  - `extractItemCategories(schema)` - extracts item→categories mapping
  - `computeHiddenItems(itemCategories, disabledCategories)` - computes hidden items

  **Breaking Changes**: None - existing `disabledCategories` API unchanged

## 2.0.0-next.3

## 2.0.0-next.2

### Minor Changes

- [#293](https://github.com/embedpdf/embed-pdf-viewer/pull/293) by [@github-actions](https://github.com/apps/github-actions) – Added `data-hidden-items` attribute for efficient CSS dependency rules.

  **Problem**: Visibility dependency rules (e.g., hiding overflow buttons when all menu items are hidden) required exponential CSS rules when using category-based logic, causing stylesheet bloat.

  **Solution**:
  - Added `hiddenItems` state that tracks which item IDs are hidden based on disabled categories
  - Dependency rules now use `data-epdf-hid` attribute to check item IDs directly
  - CSS rules are now O(n) per breakpoint instead of O(m^n)

  **New APIs**:
  - `getHiddenItems()` - returns array of hidden item IDs
  - `onCategoryChanged` event now includes `hiddenItems` in payload
  - `extractItemCategories(schema)` - extracts item→categories mapping
  - `computeHiddenItems(itemCategories, disabledCategories)` - computes hidden items

  **Breaking Changes**: None - existing `disabledCategories` API unchanged

## 2.0.0-next.1

## 2.0.0-next.0

### Major Changes

- [#279](https://github.com/embedpdf/embed-pdf-viewer/pull/279) by [@bobsingor](https://github.com/bobsingor) – ## Multi-Document Support

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

## 1.5.0

## 1.4.1

## 1.4.0

## 1.3.16

## 1.3.15

## 1.3.14

## 1.3.13

## 1.3.12

## 1.3.11

## 1.3.10

## 1.3.9

## 1.3.8

## 1.3.7

## 1.3.6

## 1.3.5

## 1.3.4

## 1.3.3

## 1.3.2

## 1.3.1

## 1.3.0

### Patch Changes

- [#168](https://github.com/embedpdf/embed-pdf-viewer/pull/168) by [@Ludy87](https://github.com/Ludy87) – Add license fields to the package.json with the value MIT

## 1.2.1

## 1.2.0

## 1.1.1

## 1.1.0

## 1.0.26

## 1.0.25

## 1.0.24

## 1.0.23

## 1.0.22

## 1.0.21

## 1.0.20

## 1.0.19

## 1.0.18

## 1.0.17

### Patch Changes

- [#63](https://github.com/embedpdf/embed-pdf-viewer/pull/63) by [@bobsingor](https://github.com/bobsingor) – Take the icons out of the plugin-ui for more flexibility

## 1.0.16

## 1.0.15

## 1.0.14

## 1.0.13

## 1.0.12

### Patch Changes

- [#47](https://github.com/embedpdf/embed-pdf-viewer/pull/47) by [@bobsingor](https://github.com/bobsingor) – Update UI plugin to have shared code between react and preact to simplify workflow

## 1.0.11

## 1.0.10

## 1.0.9

## 1.0.8

## 1.0.7

## 1.0.6

## 1.0.5

## 1.0.4

## 1.0.3

## 1.0.2

## 1.0.1

### Patch Changes

- [#15](https://github.com/embedpdf/embed-pdf-viewer/pull/15) by [@bobsingor](https://github.com/bobsingor) – Expose a couple of missing APIs for the MUI example package
