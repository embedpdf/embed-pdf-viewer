---
'@embedpdf/core-annotation': minor
---

A lent record can carry a `placeholder` (`RecordPlaceholder`: a few words and their color), which its render item hands to the layer: what an empty form field is for, shown in design mode.

A lent record can carry an `outline` too (`RecordOutline`: the lender's edge for a record with no border and no accent), and an accent says when its color is the lender's own tint rather than a group's (`base`). `unmadeItem()` takes the lender's paint (`LentPaint`: drawing, accent, outline, placeholder), so a tool's ghost is painted through the same path as the record it places.

An accent also says when its color is the lender's tint for a record anyone fills in (`anyone`), so a renderer lets that setting's CSS variable win over it.
