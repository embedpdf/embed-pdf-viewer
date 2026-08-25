---
'@embedpdf/engine-runtime': minor
'@cloudpdf/server': patch
---

Add a public `@embedpdf/engine-runtime/build-id` subpath exposing the runtime's build identity (`ENGINE_RUNTIME_VERSION`, `engineRuntimeTarget()`, `engineRuntimeBuildId()` = `version:target`) as a side-effect-free, node-only module — importable by supervisors and diagnostics without touching native-addon loading. The identity includes the resolved native target because deployments sharing a database can run different binaries (multi-arch images), and target-specific crashers must never pool or reset state across architectures. The server's engine-host supervisor now reports this identity instead of a build-time injected version.
