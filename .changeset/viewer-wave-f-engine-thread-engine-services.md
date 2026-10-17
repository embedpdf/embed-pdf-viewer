---
'@embedpdf/engine-services': minor
---

`EventHub` and `SessionEventPublisher` moved to `@embedpdf/engine-core/runtime`: they run on the main thread beside a document handle, and this package is the engine host's.
