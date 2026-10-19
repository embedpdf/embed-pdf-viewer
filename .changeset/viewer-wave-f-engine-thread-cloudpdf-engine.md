---
'@cloudpdf/engine': patch
---

The cloud engine takes its document event stream and its ids from `@embedpdf/engine-core`, so it no longer imports `@embedpdf/engine-services`, the local engine's host.
