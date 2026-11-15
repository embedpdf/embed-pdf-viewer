---
'@embedpdf/plugin-interaction': minor
'@embedpdf/plugin-annotation': minor
---

A tool can say whether the user may use it: `Tool` gains an optional `canUse()`, and the interaction plugin `canUseTool(id)`, which is `true` for a tool without one. The annotation plugin's tools say it for the permission to create annotations, so `tool:<id>` shows disabled without that permission, as before, and the tool commands no longer ask the annotation plugin. Switching to a tool doesn't ask.
