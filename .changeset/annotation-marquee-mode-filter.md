---
'@embedpdf/plugin-annotation': minor
---

Added `modeId` filtering to marquee end event handler so annotation selection only triggers during `pointerMode`, preventing interference with redaction marquees. Added page activity claims (`annotation-selection` topic) when selecting/deselecting annotations for scroll plugin page elevation.
