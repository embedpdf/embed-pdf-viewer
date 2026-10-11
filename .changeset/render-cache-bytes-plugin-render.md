---
'@embedpdf/plugin-render': minor
---

Add `cacheBytes` to `renderPlugin()`: the budget of the raster cache both planes share, in bytes. It was fixed at 128 MB, which is still the default. Apps that keep many documents open, or run in tight memory, can now lower it.
