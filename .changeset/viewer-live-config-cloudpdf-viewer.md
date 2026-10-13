---
'@cloudpdf/viewer': minor
---

`@cloudpdf/viewer` exports its own `ViewerConfig` type: every key of the viewer's config, with the engine and documents in the cloud's words, and without `scope` and `identity`, which the document's token carries. `CloudInitOptions` is that config plus `target`. The live keys (`theme`, `locale`, `disable`, `readOnly`) work as on `@embedpdf/viewer`.
