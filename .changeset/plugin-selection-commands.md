---
'@embedpdf/plugin-selection': minor
---

The selection plugin ships its own command, `selection:copy`, through `createSelectionCommands()`, which takes the browser's clipboard write as an argument. It comes from a new `@embedpdf/plugin-selection/commands` entry and from the package root. It is the command `@embedpdf/plugin-commands/standard` held, unchanged. The entry reads the plugin through its contract, so the list brings no plugin code with it.
