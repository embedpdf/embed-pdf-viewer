---
'@embedpdf/plugin-annotation': patch
---

Fix group selection box outline for noZoom annotations. The multi-select group outline now correctly encloses noZoom annotations at all zoom levels instead of being too large when zoomed in or too small when zoomed out.
