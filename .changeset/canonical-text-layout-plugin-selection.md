---
'@embedpdf/plugin-selection': minor
---

Use the engine's canonical text segmentation while keeping selection gestures and state in the plugin coordinate seam.

`SelectionSnapshot.pages` now carries segments only, with boxes exposed as derived views through `segment.rect` and `rectsForPage()`. Public geometry exports are now `buildSelectionPageGeometry`, `contentPointToPdf`, `toContentSegment`, and `toContentTextQuad`.
