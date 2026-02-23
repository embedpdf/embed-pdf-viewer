---
'@embedpdf/plugin-ui': patch
---

Fix Vue reactivity bugs when switching documents in the schema-driven viewer. `useRegisterAnchor` now accepts `MaybeRefOrGetter<string>` and re-registers anchors when `documentId` changes. `AutoMenuRenderer` now passes a reactive getter to `useUIState` so menu state tracks the active document.
