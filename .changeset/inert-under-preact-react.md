---
'@embedpdf/react': patch
---

`inert` takes effect under Preact too: the toolbar's measuring copy and an inert annotation's subtree were focusable there, because Preact sets `inert` as a property and the empty string read as false. In the viewer, the arrow keys skipped every toolbar item after the zoom field.
