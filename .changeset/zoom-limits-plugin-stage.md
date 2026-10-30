---
'@embedpdf/plugin-stage': minor
---

The Stage has zoom limits: the `minZoom` and `maxZoom` settings, `0.05` and `64` by default (5% to 6400%). Nothing zooms past them: not `zoomIn()`, a pinch or Ctrl+wheel, `zoomTo()`, `zoomBy()`, `setCamera()`, a reveal or a destination, and not a fit mode, which stops at the limit. When the limits change, a zoom outside them moves to the nearest one; a `minZoom` above `maxZoom` counts as `maxZoom`. `canZoomIn()` and `canZoomOut()` say whether the zoom is below `maxZoom` or above `minZoom`, for disabling your buttons.

`zoomIn()` and `zoomOut()` step through round levels (100%, 125%, 150%, 200%, 300% and so on) in place of ×1.2. From a level in between, such as a fit, they go to the next one, and a level within 5% of a round one steps past it.
