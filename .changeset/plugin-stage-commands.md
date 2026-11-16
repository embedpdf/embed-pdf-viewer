---
'@embedpdf/plugin-stage': minor
---

The Stage ships its own commands: `createStageCommands()` makes the list of zoom, the page moves and view rotation. It comes from a new `@embedpdf/plugin-stage/commands` entry. They are the commands `@embedpdf/plugin-commands/standard` held, unchanged. The entry reads the plugin through its contract, so the list brings no plugin code with it. Each framework package has the list ready as `stageCommands`.
