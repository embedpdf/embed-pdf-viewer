---
'@embedpdf/plugin-shell': minor
---

A named type for the state: `ShellState`, what `shellState` reads and `useShellState()` returns, the State table of the panels page with a comment on each field. Published types now name it instead of spelling out its fields. The plugin's model, from `/internal` and `/contract/host`, is now `ShellModel`, made by `initialShellModel()`, so `ShellState` has one meaning.
