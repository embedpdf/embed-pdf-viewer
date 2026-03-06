---
'@embedpdf/plugin-annotation': patch
---

Fix group selection box outline when selected annotations use `noZoom` and/or `noRotate` flags. The multi-select group outline now correctly encloses mixed selections (flagged + normal annotations), including rotated pages and non-square noRotate annotations.
