---
'@embedpdf/plugin-stage': minor
---

The Stage ships its own commands as `stageCommands`: zoom, the page moves and view rotation. They come from a new `@embedpdf/plugin-stage/commands` entry and from the package root. They are the commands `@embedpdf/plugin-commands/standard` held, unchanged. The entry reads the plugin through its contract, so the list brings no plugin code with it.
