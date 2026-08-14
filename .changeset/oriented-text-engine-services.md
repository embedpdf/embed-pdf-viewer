---
'@embedpdf/engine-services': minor
---

Reads boxes, oriented cells, flags, and text orientation through the new runtime geometry call, preserving the compact upright wire shape while emitting rotated runs for non-upright glyphs. Native page-redaction failures are now reported instead of being mistaken for pages without redaction annotations.
