---
'@cloudpdf/viewer-svelte': patch
---

The stamp and signature settings go in `plugins.stamp` and `plugins.signature`, read once when the viewer starts, with the local engine for stamp libraries as `plugins.stamp.assetEngine`'s default.
