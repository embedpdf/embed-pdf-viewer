---
'@embedpdf/plugin-stage': minor
'@embedpdf/plugin-interaction': minor
'@embedpdf/plugin-selection': minor
'@embedpdf/plugin-annotation': minor
'@embedpdf/plugin-render': minor
---

The plugin ships its own commands, from a new `/commands` entry and from the package root: `stageCommands` (zoom, pages, view rotation), `interactionCommands` (the tools) with `toolCommand()`, `createSelectionCommands()` (copy), `annotationCommands` (delete) and `createRenderCommands()` (the snapshot). They are the commands `@embedpdf/plugin-commands/standard` held, unchanged; the two that reach the browser take its part as an argument. The entry reads the plugin through its contract, so a list brings no plugin code with it.
