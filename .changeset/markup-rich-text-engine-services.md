---
'@embedpdf/engine-services': minor
---

A markup annotation's comment reads and writes as rich text: `richText` reads its `/RC` (`null` without one) and a write sets `/RC` and `/Contents` together, as Acrobat writes a note's, without touching its appearance. Writing `contents` alone on a formatted comment rewrites its `/RC` too, so other PDF apps no longer show the old text. A comment body that names no font reads as Helvetica, and is written back naming none. A redaction's overlay font is read from its `/DA` alone, so a comment in another font no longer changes it.
