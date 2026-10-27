---
'@embedpdf/plugin-selection': minor
---

A named type for the state: `SelectionState`, what `selectionState` reads and `useSelectionState()` returns, the State table of the selection page with a comment on each field. Published types now name it instead of spelling out its fields. The plugin's model, from `/internal`, is now `SelectionModel`, made by `initialSelectionModel()`, so `SelectionState` has one meaning.
