---
'@embedpdf/engine-runtime': minor
---

Add a public `@embedpdf/engine-runtime/build-id` subpath exposing the runtime's build identity (`ENGINE_RUNTIME_VERSION`, `engineRuntimeTarget()`, and `engineRuntimeBuildId()`) as a side-effect-free Node module. Supervisors and diagnostics can identify the version and resolved native target without loading the native addon.
