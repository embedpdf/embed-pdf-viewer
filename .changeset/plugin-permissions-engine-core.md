---
'@embedpdf/engine-core': minor
---

Scopes accept plugin permissions. A dotted permission whose first part isn't one of the core's namespaces (`doc`, `docs`, `pdf`, `annotations`, `fields`, `tokens`, `grants`, `shares`, `tenants`) parses as a plugin's own permission, such as `protected-display.view`, instead of being refused. The core carries it and never grants a core capability for it. `pluginPermissionsOf(scope, installed)` and `checkPluginPermission(permission, scope, installed)` answer which installed plugin permissions a scope holds (all of them under `*`); `CORE_PERMISSION_NAMESPACES` and `pluginOfPermission` name whose a permission is.
