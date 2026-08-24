---
'@embedpdf/plugin-annotation': minor
---

Round-trip rotated caret geometry through the annotation repository.

Rotated carets now lower their logical box and content-space tilt into `/Rect`, `rotation`, and `unrotatedRect`, and reconstruct that geometry when engine annotations are ingested. Upright writes explicitly clear stale transform metadata.
