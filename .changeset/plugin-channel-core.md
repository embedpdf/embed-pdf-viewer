---
'@embedpdf/core': minor
---

A plugin's own permissions work like the core's: declare them with `declare module '@embedpdf/core' { interface PluginPermissions { 'my-plugin.view': true } }`, and `ctx.allows()` and a command's `requires` take them, typed. `Permission` now includes them, and `PluginPermissions` is re-exported from `@embedpdf/engine-core` so the declaration merges.
