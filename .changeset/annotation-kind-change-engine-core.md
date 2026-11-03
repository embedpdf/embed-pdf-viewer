---
'@embedpdf/engine-core': minor
---

An update can change an annotation's kind to a sibling: a highlight, underline, squiggly line or strikeout into another of the four, and a square into a circle and back, the kinds ISO 32000-2 describes with one table of entries. New `siblingKindsOf(subtype)` lists the kinds an annotation can become. The patch is the new kind's patch, checked against its schema, and the annotation stays itself: its ref, `nm`, replies, popup, group and author. Any other subtype is refused with `InvalidArg` (`details.field` `'subtype'`), naming the kinds it can become. A value the new kind has no field for is refused, never dropped (`details.field` names it): clear it first, in the same change, as a replacement's strikeout clears its `intent`.

`applyAnnotationPatch` and `mergeAnnotationPatch` predict the new kind, a field only it has reading `null`, and `annotationPatchBetween` states `subtype` when the kind changed.
