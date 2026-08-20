---
'@embedpdf/engine-services': patch
---

Bound individual annotation-appearance raster allocations at deep zoom by reducing the effective appearance scale while preserving the original placement rectangle. Oversized page-spanning appearances now degrade softly instead of exhausting the wasm heap with multi-gigabyte bitmap requests.
