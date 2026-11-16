---
'@embedpdf/plugin-render': minor
---

The render plugin ships the snapshot's commands: `createRenderCommands()` makes the list of `tool:snapshot`, `snapshot:copy`, `snapshot:save` and `snapshot:clear`, and takes the browser's clipboard write and file download as an argument. It comes from a new `@embedpdf/plugin-render/commands` entry. They are the commands `@embedpdf/plugin-commands/standard` held, unchanged. The entry reads the plugin through its contract, so the list brings no plugin code with it. Each framework package has the list ready as `renderCommands`.
