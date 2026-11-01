---
'@embedpdf/viewer-chrome': patch
---

The `zoom:in` and `zoom:out` commands are off at the zoom limits, and the toolbar's − and + buttons show it: they grey out at `maxZoom` and `minZoom`, set under `plugins.stage`. Zooming in and out steps through round levels (100%, 125%, 150%, 200% and so on).
