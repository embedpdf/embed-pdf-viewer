---
'@embedpdf/core-stage': minor
---

The padding can differ per side: `Padding` is one number for every side or `PaddingSides` (`{ top, right, bottom, left }`, physical sides, the same right to left), and `paddingSidesOf()` gives each side of either. `CameraConstraint.padding`, `scrollMetrics()`, `cameraFromScroll()` and `placeCamera()` take it, and `travelRange()` takes the room before and after the content (`after` defaults to `before`).
