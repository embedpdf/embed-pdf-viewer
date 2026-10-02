---
'@embedpdf/vue': minor
---

Add the document entry points to `@embedpdf/vue`: `view-manager`, `page-edit`, `metadata` and `actions`.

- `@embedpdf/vue/view-manager`: `useViewManager()`, `useViewManagerState()` (`panes` and `focusedPaneId` as refs) and `useViewManagerEvent()`, for panes that each hold their own tabs; wrap a pane's body in `<DocumentScope :id="pane.activeDocumentId">`.
- `@embedpdf/vue/page-edit`: `usePageEdit()`, to rotate, move, insert, duplicate, delete and extract pages of the document in scope.
- `@embedpdf/vue/metadata`: `useMetadata()`, `useMetadataState()` (`metadata`, `custom` and `status` as refs) and `useMetadataEvent()`.
- `@embedpdf/vue/actions`: `useActions()`, `useActionsSettings()`, `useActionsEvent()` and `useActionsUiAdapter()`, which installs the browser's defaults for opening websites, printing and alerts for as long as the component lives. Its handlers can be a plain object, a ref or a getter; they are read each time an action needs one, so changing them never installs the adapter again.

Each entry re-exports its plugin, so `metadataPlugin()` comes from the same import as `useMetadata()`.
