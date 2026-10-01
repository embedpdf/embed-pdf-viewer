---
'@embedpdf/react': minor
---

`<SelectionLayer>` paints the selected text in the selection plugin's `color` setting, and `<SelectionHandles>` paints its handles in the `handles` setting; the `--epdf-text-selection`, `--epdf-text-selection-handle` and `--epdf-text-selection-handle-shadow` CSS variables win over them. Unset, the selection is the viewer's accent at 35% and the handles the accent itself, following `--epdf-accent`. Their `color` props are gone.

`useSelectionState()` is built from the plugin's `selectionState` declaration: it returns `hasSelection`, `isSelecting`, `range` and `pages` (was `pageRefs`), takes a selector, and returns the empty state without a document. `useSelectionSettings()` returns the selection settings, with or without a document.
