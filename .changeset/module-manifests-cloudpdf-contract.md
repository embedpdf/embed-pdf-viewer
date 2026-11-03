---
'@cloudpdf/contract': minor
---

`deployment.modules` (`GET /v1/deployment/modules`, API token) lists the installed server modules: `ModuleManifest` with its `ModulePermission`s and `ModuleMeter`s, all named components. `tenants.usage` takes `from` and `to` (UTC days, `to` the day after the last) in place of `period`, and its `metrics` hold modules' meters next to the core's.
