---
'@embedpdf/plugin-stage': minor
---

Expose transient `cameraResting` state and defer page-origin device snapping while zoom is moving. Pages retain fractional placement through continuous zoom and snap once the camera settles, preventing anchor jitter and per-step content movement without sacrificing crisp resting placement.
