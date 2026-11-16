---
'@embedpdf/plugin-annotation': minor
---

The annotation plugin ships its own command: `createAnnotationCommands()` makes the list with `annotation:delete`. It comes from a new `@embedpdf/plugin-annotation/commands` entry. It is the command `@embedpdf/plugin-commands/standard` held, unchanged. The entry reads the plugin through its contract, so the list brings no plugin code with it. Each framework package has the list ready as `annotationCommands`.

The tools the plugin registers say whether the user may use them (`canUse()` on the interaction plugin's `Tool`): only a user who may create annotations. So `tool:<id>` shows disabled without that permission, as before, and the tool commands no longer ask the annotation plugin.
