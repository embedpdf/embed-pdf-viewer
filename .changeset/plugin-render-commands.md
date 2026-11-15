---
'@embedpdf/plugin-render': minor
---

The render plugin ships the snapshot's commands through `createRenderCommands()`: `tool:snapshot`, `snapshot:copy`, `snapshot:save` and `snapshot:clear`. It takes the browser's clipboard write and file download as an argument. They come from a new `@embedpdf/plugin-render/commands` entry and from the package root. They are the commands `@embedpdf/plugin-commands/standard` held, unchanged. The entry reads the plugin through its contract, so the list brings no plugin code with it.
