---
'@embedpdf/core-annotation': patch
---

A `noZoom` annotation keeps its size on screen at every zoom. Its projection used the resize gesture's scale, which keeps a box at least 4pt, so past about 6× a note grew with the page while its frame still drew a custom look at 1×: a large bubble with small text and a thin border. A gesture's commit at that zoom also stored the annotation larger than it was. `scaleAbout` and `geomScaleAbout` now scale exactly; a resize passes its limit as `minSize`.
