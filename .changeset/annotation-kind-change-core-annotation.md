---
'@embedpdf/core-annotation': minor
---

A record changes its kind to a sibling: `withValues` takes a `subtype` the annotation can become now (`canChangeKind`; not when it's locked), and the patch and the pending view are the new kind's. `setFields` gives it only to annotations people may change by hand as the new kind too, so a mixed selection changes the ones that can and restyles the rest. New `selectionProperties(model, annotations)`: the properties a style panel shows for selected annotations, led by a `subtype` choice (label `annotation.style.kind`, each kind named as the comment list names it) when they are kinds of one group and each can change kind.
