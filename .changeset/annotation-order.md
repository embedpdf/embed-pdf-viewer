---
'@embedpdf/engine-core': minor
'@embedpdf/engine-services': minor
'@embedpdf/engine': minor
---

`page(pon).annotations.order()` (local engines) reads a page's `/Annots` in array order, annotations and widgets together, each entry with its family (`AnnotationOrder`). `list()` and `doc.forms.list()` give each family's own paint order; a viewer that stacks an HTML layer over the page in `/Annots` order, as PDF.js does with its annotation layer, needs the interleaving too. A raw read over a new `annotations.order` worker job, gated by `doc.annotate.read`; `runAnnotationOrderConformance` locks it.
