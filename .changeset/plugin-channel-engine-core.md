---
'@embedpdf/engine-core': minor
---

`doc.security.allows()` takes a plugin's own permission (`'protected-display.view'`) as well as the core's. A plugin declares its permissions in `PluginPermissions`, by declaration merging, so they're typed like the core's and a typo stays an error; `PluginPermission` is the union of what's declared. `isPluginId(id)` says whether an id can be a plugin's: lowercase words joined by dashes, not a core name.
