---
'@embedpdf/core-stage': minor
---

Zoom limits: `ZoomLimits` is a view's zoom range, `resolveZoomLimits(minZoom, maxZoom)` makes one inside `ZOOM_MIN` and `ZOOM_MAX` (a `minZoom` above `maxZoom` counts as `maxZoom`), and `clampZoom(zoom, limits)` keeps a zoom inside it. `resolveZoom()` and `zoomAround()` take the limits as a last argument; without it they keep the full range.
