---
'@embedpdf/engine': patch
---

The engine worker is about 12 KB smaller to download, 5% of its gzipped size: the worker, the inline worker and the build that runs without a worker are minified with swc. No API change.
