---
'@embedpdf/core-annotation': minor
---

Add distance drawing with separate endpoint and leader placement, four geometry handles, and directly draggable captions. Keep previews, hit testing, and selection bounds aligned, including short dimensions with outside arrows and displaced-label connectors. Measurement labels use the engine's PDF-coordinate rounding rules.

Rotate measurements around the center of their complete oriented selection frame, including leaders and displaced captions. Use the same frame for pointer rotation, quarter turns, reset, selection, and hit testing, keeping the center stable after a saved appearance is reloaded. Attach the rotation handle to the selection border without extra measurement-specific spacing.
