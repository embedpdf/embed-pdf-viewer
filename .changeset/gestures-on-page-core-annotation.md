---
'@embedpdf/core-annotation': patch
---

A measurement stays on its page. The offset step of drawing a distance, dragging a distance's leader, and dragging any measurement's caption stop where the measurement would reach past the page's edge; before, only the pointer was kept on the page, so a dimension line or caption built out from it could leave the page. The same rule holds for every handle drag: an end of a line stops before its arrowhead leaves the page, and a turned box's resize stops when a corner reaches the edge. An annotation already past the edge is never pushed further out, and a pointer past the edge still slides it along.
