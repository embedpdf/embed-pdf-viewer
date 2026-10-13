---
'@embedpdf/engine-services': patch
---

The write checks and import planners come from `@embedpdf/engine-core/validation`. Every annotation write is still checked against its kind's schema before its first native write, and a rect or box with `Infinity` or `NaN` in it is now refused with `InvalidArg` on `rect`, where it used to be written.

An update writes what a viewer predicted for it: a field sent back as it reads is not a change and isn't written again, so nothing follows from it. A measured polygon that resends its vertices with a new color keeps its caption and label, where the label used to be worked out again; a changed value the kind can't write is still refused.
