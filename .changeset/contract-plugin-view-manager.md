---
'@embedpdf/plugin-view-manager': minor
---

The view-manager plugin now follows the 3.0 public contract and speaks in panes: `listPanes` / `getPane` / `getPaneOrder` / `getFocusedPaneId` / `getPaneOfDocument` replace `list` / `get` / `order` / `focusedViewId` / `documentView`; `createPane({ documentIds })`, `removePane(id, { moveDocumentsTo })`, `movePane`, `setFocusedPane` and the new `splitPane` replace `createView` / `removeView` / `moveView` / `setFocused`; `ViewInfo` is `PaneInfo`; the events `onPaneCreated` / `onPaneRemoved` / `onFocusChanged` / `onDocumentMoved` are new. The package gains `./contract/host` and `./internal` entries.
