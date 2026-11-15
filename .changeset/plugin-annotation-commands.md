---
'@embedpdf/plugin-annotation': minor
---

The annotation plugin ships its own command, `annotation:delete`, as `annotationCommands`, from a new `@embedpdf/plugin-annotation/commands` entry and from the package root. It is the command `@embedpdf/plugin-commands/standard` held, unchanged. The entry reads the plugin through its contract, so the list brings no plugin code with it.

The tools the plugin registers say whether the user may use them (`canUse()` on the interaction plugin's `Tool`): only a user who may create annotations. So `tool:<id>` shows disabled without that permission, as before, and the tool commands no longer ask the annotation plugin.
