---
'@embedpdf/svelte': minor
---

Add the Svelte bindings for working with documents. `@embedpdf/svelte/view-manager` has `useViewManager()`, `useViewManagerState()` (the panes and the focused one, as a reactive object) and `useViewManagerEvent()`, for panes that each show their own tabs. `@embedpdf/svelte/page-edit` has `usePageEdit()`, to rotate, move, insert, delete and extract pages. `@embedpdf/svelte/metadata` has `useMetadata()`, `useMetadataState()` (the standard fields, your own fields and their load state) and `useMetadataEvent()`. `@embedpdf/svelte/actions` has `useActions()`, `useActionsSettings()`, `useActionsEvent()` and `useActionsUiAdapter(handlers?)`, which installs the browser's defaults for websites, printing and alerts for as long as the component lives; `handlers` replace any of them, and can be passed as a function to swap them without installing the adapter again. Each entry re-exports its plugin, so registration travels with the UI.
