---
'@embedpdf/plugin-interaction': minor
---

The interaction plugin ships the tool commands as `interactionCommands`: `tool:pointer`, `tool:pan`, `tool:zoom` and `tool:<id>` for every other tool, with `toolCommand(id)` to build a tool's own command on. They come from a new `@embedpdf/plugin-interaction/commands` entry and from the package root. They are the commands `@embedpdf/plugin-commands/standard` held, unchanged. The entry reads the plugin through its contract, so the list brings no plugin code with it.

A tool can say whether the user may use it: `Tool` gains an optional `canUse()`, and the plugin `canUseTool(id)`, which is `true` for a tool without one and `false` for an id that isn't registered. The tool commands show disabled while it says no. Switching to a tool doesn't ask.
