---
'@embedpdf/engine-services': minor
---

A reorder is one block move in a page's `/Annots`, planned against the page's stack: the rows land beside their own family's rows and the other family keeps its order. Each reorder's undo restores the old neighbours of the rows still where it left them. Page reorder and insert resolve a position to the index the engine moves to. Internal reads find an annotation's `/Annots` position from its ref, not from a row field.
