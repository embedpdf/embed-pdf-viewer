---
'@embedpdf/web': minor
---

`fitAnchoredRect(box, placement, gap, { size, view })` places anchored UI of a known size: on the side asked for when it fits, else on the opposite side when that fits or has more room, then moved to stay inside the view while its box is in view. `projectAnchoredTarget()` takes the same `fit` as an optional last argument, and every `AnchoredPosition` says which `placement` it used. The stage surface reads a tool's `touch: 'draw'` where it read `touchDirect`.
