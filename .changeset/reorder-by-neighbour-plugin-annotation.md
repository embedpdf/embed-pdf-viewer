---
'@embedpdf/plugin-annotation': minor
---

`annotation.reorder(refs, position)` replaces `move(refs, toIndex)`, and `onReordered` (the page's new `order`) replaces `onMoved`. The new order shows at once, by neighbour, and the records take the engine's order from `annotations.reordered`.
