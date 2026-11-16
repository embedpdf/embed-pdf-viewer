---
'@embedpdf/plugin-selection': minor
---

The selection plugin ships its own command: `createSelectionCommands()` makes the list with `selection:copy`, and takes the browser's clipboard write as an argument. It comes from a new `@embedpdf/plugin-selection/commands` entry. It is the command `@embedpdf/plugin-commands/standard` held, unchanged. The entry reads the plugin through its contract, so the list brings no plugin code with it. Each framework package has the list ready as `selectionCommands`.
